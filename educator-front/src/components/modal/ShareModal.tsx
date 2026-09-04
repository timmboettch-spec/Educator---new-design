import React, { useMemo, useState } from "react";
import { Copy, Mail } from "lucide-react";
import loginEn from "../../locales/auth/login/en.json";
import loginEs from "../../locales/auth/login/es.json";
import Modal from "../ui/Modal";
import { toast } from "../common/Toast";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  simulationUrl?: string;
}

const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  title,
  simulationUrl = typeof window !== "undefined" ? window.location.href : "",
}) => {
  const [copied, setCopied] = useState(false);
  const t = (
    localStorage.getItem("app_language")?.toLowerCase() === "es"
      ? loginEs
      : loginEn
  ).shareModal;

  const encodedUrl = useMemo(
    () => encodeURIComponent(simulationUrl),
    [simulationUrl],
  );
  const encodedText = useMemo(
    () => encodeURIComponent(`Check out this simulation: ${title}`),
    [title],
  );

  const openShareWindow = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const copyLink = async (message?: string) => {
    try {
      await navigator.clipboard.writeText(simulationUrl);
      setCopied(true);
      toast.success(message ?? t.copiedToast);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t.copyFailedToast);
    }
  };

  const shareToTwitter = () => {
    openShareWindow(
      `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
    );
  };

  const shareToFacebook = () => {
    openShareWindow(
      `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    );
  };

  const shareToMail = () => {
    const subject = encodeURIComponent(`Check out this simulation: ${title}`);
    const body = encodeURIComponent(
      `I found this interesting simulation: ${title}\n\nLink: ${simulationUrl}`,
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const shareToWhatsApp = () => {
    openShareWindow(`https://wa.me/?text=${encodedText}%20${encodedUrl}`);
  };

  const shareToInstagram = () => {
    openShareWindow(
      `https://www.instagram.com/?url=${encodedUrl}&text=${encodedText}`,
    );
  };

  const shareToMessenger = async () => {
    await copyLink(t.messengerCopiedToast);
  };

  const socialOptions = [
    {
      id: "mail",
      label: t.labelMail,
      action: shareToMail,
      badgeClassName: "bg-primary-100",
      icon: <Mail size={16} className="text-primary-500" aria-hidden="true" />,
    },
    {
      id: "twitter",
      label: t.labelTwitter,
      action: shareToTwitter,
      badgeClassName: "bg-primary-100",
      icon: (
        <img
          src="/assets/login/x-twitter.svg"
          alt=""
          aria-hidden="true"
          className="w-5 h-5"
        />
      ),
    },
    {
      id: "facebook",
      label: t.labelFacebook,
      action: shareToFacebook,
      badgeClassName: "bg-primary-100",
      icon: (
        <img
          src="/assets/login/facebook_icon.svg"
          alt=""
          aria-hidden="true"
          className="w-5 h-5"
        />
      ),
    },
    {
      id: "whatsapp",
      label: t.labelWhatsApp,
      action: shareToWhatsApp,
      badgeClassName: "bg-primary-100",
      icon: (
        <img
          src="/assets/login/whatsapp.svg"
          alt=""
          aria-hidden="true"
          className="w-5 h-5"
        />
      ),
    },
    {
      id: "messenger",
      label: t.labelMessenger,
      action: shareToMessenger,
      badgeClassName: "bg-primary-100",
      icon: (
        <img
          src="/assets/login/messenger.svg"
          alt=""
          aria-hidden="true"
          className="w-5 h-5"
        />
      ),
    },
    {
      id: "instagram",
      label: t.labelInstagram,
      action: shareToInstagram,
      badgeClassName: "bg-primary-100",
      icon: (
        <img
          src="/assets/login/instagram.svg"
          alt=""
          aria-hidden="true"
          className="w-5 h-5"
        />
      ),
    },
  ];

  const iconContainerClassName =
    "w-5 h-5 flex items-center justify-center [&>img]:w-full [&>img]:h-full [&>img]:object-contain [&>img]:block";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t.title}>
      <div className="space-y-6">
        <div className="grid grid-cols-4 gap-x-4 gap-y-5">
          {socialOptions.map((option) => (
            <button
              key={option.id}
              onClick={option.action}
              aria-label={option.label}
              title={option.label}
              className="group flex flex-col items-center gap-2"
            >
              <span
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${option.badgeClassName}`}
              >
                <span className={iconContainerClassName}>{option.icon}</span>
              </span>
              <span className="text-sm text-gray-600">{option.label}</span>
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <p className="text-[18px] font-medium text-gray-700">{t.pageLink}</p>
          <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-3 border border-gray-200">
            <input
              type="text"
              readOnly
              value={simulationUrl}
              className="flex-1 bg-transparent text-sm text-gray-700 outline-none"
            />
            <button
              onClick={() => copyLink()}
              className={`p-1.5 rounded-md transition-colors flex-shrink-0 ${
                copied
                  ? "bg-green-100 text-green-700"
                  : "text-gray-500 hover:bg-gray-100"
              }`}
              aria-label={t.copyAriaLabel}
              title={t.copyAriaLabel}
            >
              <Copy size={16} />
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default ShareModal;
