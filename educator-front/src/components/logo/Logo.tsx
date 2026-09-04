export default function Logo() {
  return (
    <div className="flex items-center gap-2">
      <img
        src="/assets/RealityworksAI_logo.svg"
        alt="RealityworksAI"
        className="w-10 h-10 object-contain"
      />

      <span className="text-3xl font-bold">
        Realityworks <span className="text-primary-500">AI</span>
      </span>
    </div>
  );
}
