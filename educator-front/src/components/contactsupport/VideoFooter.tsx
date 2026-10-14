import PlayVideo from '../../../public/assets/contactsupport/PlayVideo.svg';
import loginEn from '../../locales/auth/login/en.json';
import loginEs from '../../locales/auth/login/es.json';

const videos = [
  {
    title: 'Blood Pressure Simulator Tutorial',
    url: 'https://www.youtube.com/watch?v=SI7eBO3CcwE',
  },
  {
    title: 'Animal Science - Chicken Model',
    url: 'https://www.youtube.com/watch?v=EnI6ODJ7MP4',
  },
  {
    title: 'guideWELD LIVE intro',
    url: 'https://www.youtube.com/watch?v=jSb2AcxwDHY',
  },
  {
    title: 'Electrical Wiring Kit Intro',
    url: 'https://www.youtube.com/watch?v=wj8n2ynUTeg',
  },
];

export default function VideoFooter() {
  const language =
    localStorage.getItem('app_language')?.toLowerCase() === 'es' ? 'es' : 'en';
  const locale = (language === 'es' ? loginEs : loginEn).contactSupport;

  return (
    <div className="w-full p-6">
      <div className="grid grid-cols-2 items-center gap-12">
        <div className="overflow-hidden rounded-xl shadow-lg">
          <iframe
            className="w-full aspect-video"
            src="https://www.youtube.com/embed/XGTUqYHnlEY"
            title="YouTube video player"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>

        <div className="flex flex-col gap-12">
          <h3 className="text-primary-500 text-xl font-semibold">
            {locale.mostViewedVideos}
          </h3>

          {videos.map((video, index) => (
            <a
              key={index}
              href={video.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-5 hover:text-yellow-100 transition"
            >
              <img src={PlayVideo} alt="Play Video" className="w-5 h-5" />
              <span className="text-gray-800">{video.title}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
