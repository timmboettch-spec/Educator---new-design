/**
 * Support Console host route (/support).
 *
 * The console itself is a self-contained prototype in `public/support-console.html`
 * (its own markup, state and styling). Rather than port ~2,400 lines into React, this
 * route mounts it full-bleed in an iframe so the prototype stays exactly as designed
 * and can be iterated on independently.
 *
 * Sign-in lives INSIDE the console (it ships its own login screen), so there is one
 * login, not two. See SUPPORT_USER / SUPPORT_PASS in support-console.html.
 *
 * PROTOTYPE-GRADE AUTH: the credential check runs in the browser, so it keeps casual
 * visitors out but is not a security boundary — anyone can read the page source. Before
 * this is exposed to real users it needs a server-side session (see the note in
 * support-console.html).
 */
import { useEffect } from "react";

const CONSOLE_SRC = "/support-console.html";

export default function SupportConsole(): React.ReactElement {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = "Support Console — Realityworks AI";
    // The console manages its own scrolling inside the iframe.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.title = prevTitle;
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-white">
      <iframe
        src={CONSOLE_SRC}
        title="Support Console"
        className="w-full h-full border-0 block"
        // Same-origin so the console keeps access to its own storage; scripts and forms
        // are required for the prototype to work at all.
        sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals"
      />
    </div>
  );
}
