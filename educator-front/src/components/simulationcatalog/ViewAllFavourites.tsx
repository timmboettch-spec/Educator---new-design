import type { SectionItem } from '@/types';
import { SimCatalogGrid } from './SimCatalogGrid';

export const ViewAllFavourites = ({
  setViewAllFavourites,
  allSimItems,
  labels,
}: {
  setViewAllFavourites: React.Dispatch<React.SetStateAction<boolean>>;
  allSimItems: SectionItem[];
  labels?: {
    noFavourites?: string;
    noFavouritesSubtitle?: string;
    searchPlaceholder?: string;
    title?: string;
  };
}) => {
  const favouriteItems = allSimItems.filter((item) => item.myFavorite);

  return (
    <SimCatalogGrid
      items={favouriteItems}
      title={labels?.title ?? 'Favorite Simulations'}
      onBack={() => setViewAllFavourites(false)}
    />
  );
};
