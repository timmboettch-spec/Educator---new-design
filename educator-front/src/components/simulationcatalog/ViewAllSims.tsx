import { SectionItem } from "@/types";
import { SimCatalogGrid } from "./SimCatalogGrid";

export const ViewAllSims = ({
    setViewAllSims,
    diffFiltered,
}: {
    setViewAllSims: React.Dispatch<React.SetStateAction<boolean>>;
    diffFiltered: SectionItem[];
}) => (
    <SimCatalogGrid items={diffFiltered} onBack={() => setViewAllSims(false)} />
);
