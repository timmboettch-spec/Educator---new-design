import { useAppSelector } from '../store/hooks';
import { selectIsLoading, selectIsLoggingOut } from '../redux/loader/loaderSlice';

export const usePageLoader = () => {
  const isLoading = useAppSelector(selectIsLoading);
  const isLoggingOut = useAppSelector(selectIsLoggingOut);

  return isLoading || isLoggingOut;
};
