import { useEffect, useState } from "react";
import App from "./App.jsx";
import Landing from "./components/Landing.jsx";
import ApmWriter from "./components/ApmWriter.jsx";

// Pages are addressed by the URL hash (#/newsletter, #/apm), so links and the
// back button work without any server routing on Vercel.
const PAGES = ["newsletter", "apm"];
const current = () => {
  const h = window.location.hash.replace(/^#\/?/, "").split("/")[0];
  return PAGES.includes(h) ? h : "";
};

export default function Root() {
  const [page, setPage] = useState(current);
  // A page stays mounted once opened, so work in progress survives a trip
  // back to the start page.
  const [opened, setOpened] = useState(() => new Set([current()]));

  useEffect(() => {
    const on = () => {
      const p = current();
      setPage(p);
      setOpened((o) => (o.has(p) ? o : new Set([...o, p])));
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  useEffect(() => {
    document.title =
      page === "newsletter" ? "Newsletter Builder" : page === "apm" ? "Rosie for Editors" : "Meet Rosie";
  }, [page]);

  return (
    <>
      {page === "" && <Landing />}
      {opened.has("newsletter") && (
        <div className="page" hidden={page !== "newsletter"}>
          <App />
        </div>
      )}
      {opened.has("apm") && (
        <div className="page" hidden={page !== "apm"}>
          <ApmWriter />
        </div>
      )}
    </>
  );
}
