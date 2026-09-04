import type { SectionItem } from '../../types/index';
import { SimCatalogGrid } from '../simulationcatalog/SimCatalogGrid';

interface SimulationAllViewProps {
  items: SectionItem[];
  title: string;
  onBack: () => void;
  // Retained for API compatibility; tile clicks navigate to the details page
  // (same destination the catalog used) via the shared grid's tiles.
  onSelect?: (item: SectionItem) => void;
}

const SimulationAllView = ({ items, title, onBack }: SimulationAllViewProps) => (
  <SimCatalogGrid items={items} title={title} onBack={onBack} />
);

export default SimulationAllView;
