import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '../components/common/Toast';
import {
  FetchClassesRequest,
  selectClasses,
  selectClassStatus,
} from '../redux/class/GetClassRedux';
import { useUpdateClassMutation } from '../redux/api/classes/classesApi';
import {
  buildUpdateClassBody,
  getApiErrorMessage,
} from '../redux/api/classes/classesService';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setLoading } from '../redux/loader/loaderSlice';
import {
  finishLmsLaunchSession,
  resyncLmsRostersIfConfigured,
  runLtiLaunchSyncIfNeeded,
} from '../utils/lmsLaunchSync';
import { resyncGoogleClassroomRostersIfConfigured } from '../utils/googleClassroomRosterSync';
import { GetEducatorSimulationReports } from '../redux/reports/EducatorReportsRedux';
import { getEducatorId } from '../utils/normalizeAuthUser';
import { computeClassStatus } from '../utils/classUtils';
import { translateApiError } from '../utils/translateApiError';
import type { Class, ClassWithStudents } from '../types/Class_types';

export interface UseClassSyncParams {
  user: Record<string, unknown> | null;
  allClasses: ClassWithStudents[];
  language: 'en' | 'es';
}

/**
 * Owns class list fetching/LTI-LMS/Google Classroom sync orchestration,
 * automatic correction of stale class statuses, and status changes made from
 * the row action menu (both write to the same `syncedStatusRef`, so they're
 * kept together to avoid two owners of one ref).
 */
export function useClassSync({
  user,
  allClasses,
  language,
}: UseClassSyncParams) {
  const dispatch = useAppDispatch();
  const [updateClass] = useUpdateClassMutation();
  const { t } = useTranslation('classManagement');
  const classes = useAppSelector(selectClasses) ?? [];
  const classStatus = useAppSelector(selectClassStatus);
  const syncedStatusRef = useRef<Set<string>>(new Set());

  const refetchClasses = async () => {
    if (user?.role !== 'Educator') return;
    const educatorId = getEducatorId(user);

    let launchSyncSucceeded = false;

    const hasCachedClasses = classStatus === 'succeeded' && classes.length > 0;
    if (!hasCachedClasses) {
      try {
        dispatch(setLoading(true));
        try {
          launchSyncSucceeded = await runLtiLaunchSyncIfNeeded(dispatch);
          await resyncLmsRostersIfConfigured(dispatch);
          await resyncGoogleClassroomRostersIfConfigured(dispatch);
        } catch {
          // Launch sync/resync failed — still load the class list below.
        }
        await Promise.allSettled([
          dispatch(FetchClassesRequest()).unwrap(),
          educatorId
            ? dispatch(GetEducatorSimulationReports({ educatorId })).unwrap()
            : Promise.resolve(),
        ]);
      } finally {
        if (launchSyncSucceeded) {
          finishLmsLaunchSession();
        }
        dispatch(setLoading(false));
      }
      return;
    }

    try {
      launchSyncSucceeded = await runLtiLaunchSyncIfNeeded(dispatch);
      await resyncLmsRostersIfConfigured(dispatch);
      await resyncGoogleClassroomRostersIfConfigured(dispatch);
    } catch {
      // Launch sync/resync failed — still refresh the class list below.
    }
    void dispatch(FetchClassesRequest());
    if (educatorId) {
      void dispatch(GetEducatorSimulationReports({ educatorId }));
    }
    if (launchSyncSucceeded) {
      finishLmsLaunchSession();
    }
  };

  useEffect(() => {
    void refetchClasses();
    // Mount-only: initial class list load.
  }, []);

  useEffect(() => {
    if (!allClasses.length) return;

    const staleClasses = allClasses.filter((cls) => {
      if (
        cls.status === 'DRAFT' ||
        cls.status === 'ARCHIEVED' ||
        cls.status === 'INACTIVE' ||
        cls.status === 'ATTENTION'
      )
        return false;
      if (syncedStatusRef.current.has(cls.id)) return false;
      const correct = computeClassStatus(cls.start_date, cls.end_date);
      return cls.status?.toUpperCase() !== correct;
    });

    if (!staleClasses.length) return;

    staleClasses.forEach((cls) => {
      syncedStatusRef.current.add(cls.id);
      const correctStatus = computeClassStatus(cls.start_date, cls.end_date);
      void updateClass({
        id: cls.id,
        body: buildUpdateClassBody({
          class_name: cls.class_name,
          status: correctStatus,
          start_date: cls.start_date ?? '',
          end_date: cls.end_date ?? '',
        }),
      });
    });
  }, [allClasses, updateClass]);

  const handleStatusChange = async (
    row: ClassWithStudents,
    status: NonNullable<Class['status']>
  ) => {
    try {
      await updateClass({
        id: row.id,
        body: buildUpdateClassBody({
          class_name: row.class_name,
          status,
          start_date: row.start_date ?? '',
          end_date: row.end_date ?? '',
        }),
      }).unwrap();
      syncedStatusRef.current.add(row.id);
      toast.success(t('toast.updated'));
      void refetchClasses();
    } catch (error) {
      const errorMsg = getApiErrorMessage(error, t('page.failedUpdate'));
      toast.error(translateApiError(errorMsg, language));
    }
  };

  return { refetchClasses, handleStatusChange };
}
