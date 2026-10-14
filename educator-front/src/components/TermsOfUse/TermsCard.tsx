import DOMPurify from 'dompurify';

interface TermsCardProps {
  id: string;
  title: string;
  content: string;
  isActive: boolean;
}

const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'strong',
    'em',
    'b',
    'i',
    'u',
    'a',
    'br',
    'p',
    'ul',
    'ol',
    'li',
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel'],
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'svg', 'style'],
  FORBID_ATTR: ['style'],
};

const TermsCard = ({ id, title, content, isActive }: TermsCardProps) => {
  const sanitizedContent = DOMPurify.sanitize(content, SANITIZE_CONFIG);

  return (
    <div
      id={`section-${id}`}
      className={`bg-white rounded-2xl p-5 mb-5 transition-all duration-400 ${
        isActive
          ? 'scale-[100px] shadow-[0_8px_24px_rgba(0,0,0,0.15)]'
          : 'shadow-[0_2px_10px_rgba(0,0,0,0.08)]'
      }`}
    >
      <div className="flex items-center gap-4 pb-4 border-b border-gray-200">
        <div className="w-9 h-9 text-[15px] rounded-full bg-orange-500 text-white flex items-center justify-center font-semibold">
          {id}
        </div>

        <h3
          className={`text-[16px] font-medium ${isActive ? 'text-[#F28C28]' : 'text-gray-800'}`}
        >
          {title}
        </h3>
      </div>

      <div
        className="mt-4 text-[14px] text-gray-900 leading-[24px] whitespace-pre-line [&_a]:text-[#F28C28] [&_a]:underline"
        dangerouslySetInnerHTML={{ __html: sanitizedContent }}
      ></div>
    </div>
  );
};

export default TermsCard;
