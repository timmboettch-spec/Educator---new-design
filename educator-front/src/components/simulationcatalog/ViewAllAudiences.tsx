import { ArrowLeft, Heart } from "lucide-react";
import { AnimatedCard, CatalogCardImage } from "./AnimatedCard";
import { SectionItem } from "@/types";
import { useCatalogFavorite } from '@/hooks/useCatalogFavorite';

export const ViewAllAudiences = ({
    setViewAllAudiences,
    audienceEntries,
    setViewAllState,
}: {
    setViewAllAudiences: (view: boolean) => void;
    audienceEntries: [string, SectionItem[]][];
    setViewAllState: (state: { title: string; items: SectionItem[] }) => void;
}) => {
    const { isGroupInLibrary, loadingIds, handleAddGroup, isStartTrial } = useCatalogFavorite();

    return (
        <div className="min-h-screen bg-white font-sans">
            <div className="w-full bg-white shadow-sm sticky top-0 z-10">
                <div className="px-6 py-4 flex items-center gap-4">
                    <button
                        onClick={() => setViewAllAudiences(false)}
                        className="flex items-center gap-1 text-sm text-gray-500 hover:text-primary-500 transition-colors flex-shrink-0"
                    >
                        <ArrowLeft size={15} /> Back
                    </button>
                    <h1 className="text-lg font-bold text-gray-800 flex-1">All Target Audiences</h1>
                    <span className="text-sm text-gray-500 flex-shrink-0">
                        {audienceEntries.length} audiences
                    </span>
                </div>
            </div>
            <div className="max-w-7xl mx-auto px-6 py-8">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {audienceEntries.map(([audience, sims], idx) => {
                        const allInLibrary = isGroupInLibrary(sims);
                        const isLoading = sims.some((s) => loadingIds.has(String(s.scenarioId ?? s.id)));
                        return (
                            <AnimatedCard
                                key={audience}
                                delay={idx * 50}
                                className="relative rounded-xl overflow-hidden aspect-[3/2] bg-gray-900 group cursor-pointer shadow"
                                onClick={() => {
                                    setViewAllAudiences(false);
                                    setViewAllState({ title: audience, items: sims });
                                }}
                            >
                                <CatalogCardImage
                                    src={sims[0]?.image}
                                    alt={audience}
                                    className="absolute inset-0 w-full h-full object-contain transition-transform duration-300 group-hover:scale-105"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                                {!isStartTrial && (
                                <button
                                    onClick={(e) => handleAddGroup(e, sims)}
                                    disabled={isLoading}
                                    className={`absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-white text-primary-500 z-10 ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    <Heart size={13} fill={allInLibrary ? 'currentColor' : 'none'} strokeWidth={2} />
                                </button>
                                )}
                                <div className="absolute bottom-0 left-0 right-0 p-3 flex items-end justify-between">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white text-base font-semibold line-clamp-2">{audience}</p>
                                        <p className="text-white/70 text-xs mt-0.5">
                                            {sims.length} simulation{sims.length !== 1 ? 's' : ''}
                                        </p>
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setViewAllAudiences(false);
                                            setViewAllState({ title: audience, items: sims });
                                        }}
                                        className="text-xs bg-primary-500 hover:bg-primary-600 text-white px-3 py-1 rounded-full transition-all flex-shrink-0 ml-2"
                                    >
                                        View
                                    </button>
                                </div>
                            </AnimatedCard>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};