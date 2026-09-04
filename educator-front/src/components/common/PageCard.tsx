export const Card = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      {children}
    </div>
  );
};
