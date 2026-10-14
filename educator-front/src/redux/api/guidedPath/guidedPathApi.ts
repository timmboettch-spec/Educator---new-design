import { createApi } from '@reduxjs/toolkit/query/react';

import type { RoleSlug } from '@/features/auth/model/roles';
import { axiosBaseQuery } from '../axiosBaseQuery';
import { GUIDED_PATH } from './guidedPath.endpoints';
import { writeCompletedCache } from './guidedPathService';
import type {
  GuidedPathResDto,
  GuidedPathResponseDto,
  UpdateGuidedPathReqDto,
} from './guidedPath.types';

/** True when `row` was saved before `than`, by the BE `updatedAt`. */
const isOlderRow = (
  row: Pick<GuidedPathResDto, 'updatedAt'>,
  than: Pick<GuidedPathResDto, 'updatedAt'>
): boolean => Date.parse(row.updatedAt) < Date.parse(than.updatedAt);

export const guidedPathApi = createApi({
  reducerPath: 'guidedPathApi',
  baseQuery: axiosBaseQuery(),
  tagTypes: ['GuidedPath'],
  endpoints: (build) => ({
    // The arg is only a cache key: the BE reads the selected role from the
    // token, so cached progress stays separate per role after a role switch.
    getGuidedPath: build.query<GuidedPathResDto, RoleSlug>({
      query: () => ({ url: GUIDED_PATH }),
      transformResponse: (response: GuidedPathResponseDto) => response.data,
      providesTags: ['GuidedPath'],
      async onQueryStarted(_role, { queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          if (data.completed) writeCompletedCache(data.userId, data.roleType);
        } catch {
          /* nothing to cache */
        }
      },
    }),

    updateGuidedPath: build.mutation<
      GuidedPathResDto,
      UpdateGuidedPathReqDto & { role: RoleSlug }
    >({
      query: ({ state, completed }) => ({
        url: GUIDED_PATH,
        method: 'PUT',
        data: { state, completed },
      }),
      transformResponse: (response: GuidedPathResponseDto) => response.data,
      // Optimistic: the banner reacts instantly; rolled back if the PUT fails.
      // On success the response (the full row) replaces the cache, so no
      // refetch GET is needed — unless the cache already holds a newer row
      // (a later PUT answered first), which a late response must not undo.
      async onQueryStarted(
        { role, state, completed },
        { dispatch, queryFulfilled }
      ) {
        const patch = dispatch(
          guidedPathApi.util.updateQueryData('getGuidedPath', role, (draft) => {
            if (state !== undefined) draft.state = state;
            if (completed !== undefined) draft.completed = completed;
          })
        );
        try {
          const { data } = await queryFulfilled;
          dispatch(
            guidedPathApi.util.updateQueryData(
              'getGuidedPath',
              role,
              (draft) => (isOlderRow(data, draft) ? undefined : data)
            )
          );
          if (data.completed) writeCompletedCache(data.userId, data.roleType);
        } catch {
          patch.undo();
        }
      },
    }),
  }),
});

export const { useGetGuidedPathQuery, useUpdateGuidedPathMutation } =
  guidedPathApi;
