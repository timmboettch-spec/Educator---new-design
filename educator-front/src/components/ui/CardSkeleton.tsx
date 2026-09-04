export default function CardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-primary-100 shadow-sm overflow-hidden animate-pulse">
      <div className="px-5 pt-5 pb-3 flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-4 w-48 bg-gray-200 rounded" />
          <div className="h-3 w-32 bg-gray-100 rounded" />
        </div>
        <div className="h-7 w-20 bg-gray-100 rounded-full" />
      </div>
      <div className="grid grid-cols-3 gap-3 px-4 pb-4 pt-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col items-center gap-2 py-4">
            <div className="w-10 h-10 bg-gray-100 rounded-full" />
            <div className="h-6 w-8 bg-gray-200 rounded" />
            <div className="h-3 w-16 bg-gray-100 rounded" />
            <div className="h-6 w-full bg-primary-100 rounded-lg mt-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
