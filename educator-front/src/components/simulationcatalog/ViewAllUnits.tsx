import { Heart } from 'lucide-react';
import { AnimatedCard, CatalogCardImage } from "./AnimatedCard";
import { ArrowLeft } from "lucide-react";
import { SectionItem } from "@/types";
import { useCatalogFavorite } from '@/hooks/useCatalogFavorite';

export const ViewAllUnits = ({
    setViewAllUnits,
    setViewAllState,
    unitEntries,
}: {
    setViewAllUnits: (state: boolean) => void;
    setViewAllState: (state: { title: string; items: SectionItem[] }) => void;
    unitEntries: [string, { sims: SectionItem[]; image?: string }][];
}) => {
    const { isGroupInLibrary, loadingIds, handleAddGroup, isStartTrial } = useCatalogFavorite();

    return (
        <div className="min-h-screen bg-white font-sans">
            {/* Header */}
            <div className="w-full bg-white shadow-sm sticky top-0 z-10">
                <div className="px-6 py-4 flex items-center gap-4">
                    <button
                        onClick={() => setViewAllUnits(false)}
                        className="flex items-center gap-1 text-sm text-gray-500 hover:text-primary-500 transition-colors flex-shrink-0"
                    >
                        <ArrowLeft size={15} /> Back
                    </button>
                    <h1 className="text-lg font-bold text-gray-800 flex-1">All Units</h1>
                    <span className="text-sm text-gray-500 flex-shrink-0">{unitEntries.length} units</span>
                </div>
            </div>
            {/* Units grid */}
            <div className="px-6 py-8">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {unitEntries.map(([unitName, { sims, image }], idx) => {
                        const allInLibrary = isGroupInLibrary(sims);
                        const isLoading = sims.some((s) => loadingIds.has(String(s.scenarioId ?? s.id)));
                        return (
                            <AnimatedCard
                                key={unitName}
                                delay={idx * 50}
                                className="relative rounded-xl aspect-[3/2] bg-gray-900 group cursor-pointer shadow"
                                onClick={() => {
                                    setViewAllUnits(false);
                                    setViewAllState({ title: unitName, items: sims });
                                }}
                            >
                                {/* overflow-hidden on inner div only so heart is never clipped on scroll */}
                                <div className="absolute inset-0 rounded-xl overflow-hidden">
                                    <CatalogCardImage
                                        src={image}
                                        alt={unitName}
                                        className="absolute inset-0 w-full h-full object-contain transition-transform duration-300 group-hover:scale-105"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                                    <div className="absolute bottom-0 left-0 right-0 p-3 flex items-end justify-between">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-white text-base font-semibold line-clamp-2">{unitName}</p>
                                            <p className="text-white/70 text-xs mt-0.5">
                                                {sims.length} simulation{sims.length !== 1 ? 's' : ''}
                                            </p>
                                        </div>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setViewAllUnits(false);
                                                setViewAllState({ title: unitName, items: sims });
                                            }}
                                            className="text-xs bg-primary-500 hover:bg-primary-600 text-white px-3 py-1 rounded-full transition-all flex-shrink-0 ml-2"
                                        >
                                            View
                                        </button>
                                    </div>
                                </div>
                                {!isStartTrial && (
                                <button
                                    onClick={(e) => handleAddGroup(e, sims)}
                                    disabled={isLoading}
                                    className={`absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-white text-primary-500 z-10 ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    <Heart size={13} fill={allInLibrary ? 'currentColor' : 'none'} strokeWidth={2} />
                                </button>
                                )}
                            </AnimatedCard>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};