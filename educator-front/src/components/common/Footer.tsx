import { Link, useNavigate, useLocation } from 'react-router-dom';
import { AUTH_MESSAGES } from '../../utils/messages/auth';
import { FOOTER_MESSAGES } from '../../utils/messages/footer';
import loginEn from '../../locales/auth/login/en.json';
import loginEs from '../../locales/auth/login/es.json';

type SupportedLang = 'en' | 'es';

const LANGUAGE_STORAGE_KEY = 'app_language';

const getStoredLanguage = (): SupportedLang => {
  if (typeof window === 'undefined') {
    return 'en';
  }

  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY)?.toLowerCase();
  return saved === 'es' ? 'es' : 'en';
};

const socialLinks = [
  {
    label: 'Twitter',
    url: 'https://x.com/RealityworksInc',
    icon: (
      <svg
        viewBox="0 0 16 16"
        fill="currentColor"
        className="w-5 h-5"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M12.6 0.75h2.454l-5.36 6.142L16 15.25h-4.937l-3.867-5.07-4.425 5.07H0.316l5.733-6.57L0 0.75h5.063l3.495 4.633L12.601 0.75Zm-0.86 13.028h1.36L4.323 2.145H2.865z" />
      </svg>
    ),
  },
  {
    label: 'Facebook',
    url: 'https://www.facebook.com/realityworksinc',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className="w-5 h-5"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987H7.898V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" />
      </svg>
    ),
  },
  {
    label: 'Instagram',
    url: 'https://www.instagram.com/realityworksofficial',
    icon: (
      <svg
        viewBox="0 0 20 19"
        fill="currentColor"
        className="w-5 h-5"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M9.76539 1.67364C12.3728 1.67364 12.6815 1.68292 13.7115 1.7276C14.3308 1.7348 14.9443 1.84296 15.5251 2.04737C15.9463 2.20188 16.3289 2.43858 16.6481 2.74221C16.9674 3.04585 17.2162 3.40971 17.3787 3.81035C17.5936 4.36283 17.7073 4.94626 17.7149 5.53529C17.7614 6.51497 17.7716 6.80865 17.7716 9.28859C17.7716 11.7685 17.7619 12.0622 17.7149 13.0419C17.7073 13.6309 17.5936 14.2144 17.3787 14.7668C17.2162 15.1675 16.9674 15.5313 16.6481 15.835C16.3289 16.1386 15.9463 16.3753 15.5251 16.5298C14.9443 16.7342 14.3308 16.8424 13.7115 16.8496C12.682 16.8938 12.3732 16.9035 9.76539 16.9035C7.15757 16.9035 6.8488 16.8943 5.81924 16.8496C5.19995 16.8424 4.58653 16.7342 4.00567 16.5298C3.58444 16.3753 3.20189 16.1386 2.88265 15.835C2.56341 15.5313 2.31456 15.1675 2.15211 14.7668C1.93719 14.2144 1.82348 13.6309 1.8159 13.0419C1.7694 12.0622 1.75917 11.7685 1.75917 9.28859C1.75917 6.80865 1.76893 6.51497 1.8159 5.53529C1.82348 4.94626 1.93719 4.36283 2.15211 3.81035C2.31456 3.40971 2.56341 3.04585 2.88265 2.74221C3.20189 2.43858 3.58444 2.20188 4.00567 2.04737C4.58653 1.84296 5.19995 1.7348 5.81924 1.7276C6.84926 1.68337 7.15803 1.67364 9.76539 1.67364ZM9.76539 0C7.11479 0 6.7809 0.010615 5.73926 0.0557288C4.92876 0.0710622 4.12685 0.217024 3.36767 0.487407C2.7164 0.720789 2.12653 1.08652 1.63919 1.55908C1.1419 2.02277 0.757048 2.58414 0.511521 3.20397C0.227245 3.92605 0.0737836 4.68877 0.0576624 5.45966C0.0111605 6.44951 0 6.76708 0 9.28815C0 11.8092 0.0111604 12.1268 0.0585923 13.1175C0.0747136 13.8884 0.228176 14.6511 0.512451 15.3732C0.757705 15.993 1.14224 16.5543 1.63919 17.0181C2.1268 17.4908 2.717 17.8565 3.3686 18.0898C4.12778 18.3602 4.92969 18.5061 5.74019 18.5214C6.78183 18.5657 7.11432 18.5772 9.76632 18.5772C12.4183 18.5772 12.7508 18.5666 13.7925 18.5214C14.603 18.5061 15.4049 18.3602 16.164 18.0898C16.8126 17.8507 17.4015 17.4855 17.8931 17.0176C18.3847 16.5497 18.7683 15.9893 19.0193 15.3723C19.3035 14.6502 19.457 13.8875 19.4731 13.1166C19.5196 12.1268 19.5308 11.8092 19.5308 9.28815C19.5308 6.76708 19.5196 6.44951 19.4722 5.45878C19.4561 4.68788 19.3026 3.92517 19.0183 3.20308C18.7731 2.58333 18.3885 2.02197 17.8916 1.5582C17.404 1.08553 16.8138 0.719791 16.1622 0.486522C15.403 0.21614 14.6011 0.0701777 13.7906 0.0548443C12.7499 0.0106151 12.416 0 9.76539 0Z" />
        <path d="M9.77258 4.52344C8.78075 4.52344 7.8112 4.80317 6.98652 5.32727C6.16185 5.85137 5.5191 6.5963 5.13954 7.46784C4.75999 8.33939 4.66068 9.29841 4.85417 10.2236C5.04767 11.1489 5.52528 11.9987 6.22661 12.6658C6.92793 13.3329 7.82148 13.7871 8.79425 13.9712C9.76701 14.1552 10.7753 14.0607 11.6916 13.6997C12.608 13.3387 13.3912 12.7274 13.9422 11.943C14.4932 11.1586 14.7873 10.2365 14.7873 9.29312C14.7873 8.02812 14.259 6.81494 13.3185 5.92045C12.3781 5.02596 11.1026 4.52344 9.77258 4.52344ZM9.77258 12.3892C9.12877 12.3892 8.49943 12.2076 7.96412 11.8674C7.42882 11.5272 7.0116 11.0437 6.76523 10.4779C6.51885 9.9122 6.45439 9.28969 6.57999 8.68911C6.70559 8.08854 7.01561 7.53688 7.47085 7.10389C7.92609 6.67089 8.5061 6.37602 9.13753 6.25656C9.76897 6.1371 10.4235 6.19841 11.0183 6.43275C11.6131 6.66708 12.1214 7.06391 12.4791 7.57305C12.8368 8.08219 13.0277 8.68078 13.0277 9.29312C13.0277 10.1142 12.6848 10.9017 12.0743 11.4824C11.4638 12.063 10.6359 12.3892 9.77258 12.3892Z" />
        <path d="M14.9843 5.44791C15.6315 5.44791 16.1562 4.94889 16.1562 4.33333C16.1562 3.71776 15.6315 3.21875 14.9843 3.21875C14.3372 3.21875 13.8125 3.71776 13.8125 4.33333C13.8125 4.94889 14.3372 5.44791 14.9843 5.44791Z" />
      </svg>
    ),
  },
  {
    label: 'LinkedIn',
    url: 'https://www.linkedin.com/company/realityworks',
    icon: (
      <svg
        viewBox="-2 -2 24 24"
        fill="currentColor"
        className="w-5 h-5"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M19.959 11.719v7.379h-4.278v-6.885c0-1.73-.619-2.91-2.167-2.91-1.182 0-1.886.796-2.195 1.565-.113.275-.142.658-.142 1.043v7.187h-4.28s.058-11.66 0-12.869h4.28v1.824l-.028.042h.028v-.042c.568-.875 1.583-2.126 3.856-2.126 2.815 0 4.926 1.84 4.926 5.792zM2.421.026C.958.026 0 .986 0 2.249c0 1.235.93 2.224 2.365 2.224h.028c1.493 0 2.42-.989 2.42-2.224C4.787.986 3.887.026 2.422.026zM.254 19.098h4.278V6.229H.254v12.869z" />
      </svg>
    ),
  },
];

const Footer = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const language = getStoredLanguage();
  const locale = language === 'es' ? loginEs : loginEn;
  const footerLocale = locale.footer;

  const companyLinks = [
    {
      label: footerLocale.companySimulationCatalog,
      path: '/simulation-catalog',
    },
    { label: footerLocale.companyMySimulations, path: '/simulationlibrary' },
  ];

  const helpLinks = [
    { label: footerLocale.helpCustomerSupport, path: '/customersupport' },
    { label: footerLocale.helpTerms, path: '/terms' },
    { label: footerLocale.helpPrivacy, path: '/privacypolicy' },
  ];

  const handleNavClick = (e: React.MouseEvent, path: string) => {
    e.preventDefault();
    if (location.pathname === path) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      navigate(path);
    }
  };

  return (
    <footer className="bg-[#f5f4ef] border-t mt-16">
      <div className="px-6 py-10">
        <div className="flex flex-col md:flex-row justify-between gap-10">
          <div>
            <div className="flex items-center gap-3">
              <img
                src="/assets/RealityworksAI_logo.svg"
                alt={AUTH_MESSAGES.ALTS.LOGO}
                className="h-10 w-auto flex-shrink-0"
              />
              <h2 className="text-lg font-semibold text-gray-800">
                {AUTH_MESSAGES.TITLES.APP_NAME}{' '}
                <span className="text-orange-500">
                  {AUTH_MESSAGES.TITLES.APP_SUFFIX}
                </span>
              </h2>
            </div>

            <div className="flex gap-3 mt-4">
              {socialLinks.map(({ label, url, icon }) => (
                <button
                  key={label}
                  type="button"
                  aria-label={label}
                  onClick={(e) => {
                    e.preventDefault();
                    window.open(url, '_blank');
                  }}
                  className="group w-9 h-9 flex-shrink-0 aspect-square flex items-center justify-center rounded-full border border-gray-300 text-orange-500 cursor-pointer hover:bg-orange-500 hover:text-white hover:border-orange-500 transition focus:outline-none focus:ring-2 focus:ring-orange-400"
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-orange-500 mb-3">
              {footerLocale.companyTitle ?? FOOTER_MESSAGES.TITLES.COMPANY}
            </h3>
            <ul className="space-y-2 text-sm text-gray-600">
              {companyLinks.map((item, index) => (
                <li
                  key={index}
                  className="hover:text-orange-500 cursor-pointer"
                >
                  <Link
                    to={item.path}
                    className="hover:text-orange-500"
                    onClick={(e) => handleNavClick(e, item.path)}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-orange-500 mb-3">
              {footerLocale.helpTitle ?? FOOTER_MESSAGES.TITLES.HELP}
            </h3>
            <ul className="space-y-2 text-sm text-gray-600">
              {helpLinks.map((item, index) => (
                <li
                  key={index}
                  className="hover:text-orange-500 cursor-pointer"
                >
                  <Link to={item.path} className="hover:text-orange-500">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="border-t mt-10 pt-4 text-center text-xs text-gray-500">
          {footerLocale.copyright ?? FOOTER_MESSAGES.COPYRIGHT}
        </div>
      </div>
    </footer>
  );
};

export default Footer;
