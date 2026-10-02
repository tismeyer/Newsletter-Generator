import logo from "../assets/logo.png";
import icon from "../assets/icon.png";
import rosie from "../assets/rosie.jpg";

const TOOLS = [
  {
    href: "#/apm",
    img: rosie,
    round: true,
    title: "Write manual content",
    by: "Rosie for Editors",
    text: "Turn your notes into APM-conformant text for the manuals. Rosie follows the APM language and WebManuals rules, checks the result and marks anything to confirm.",
    go: "Open Rosie",
  },
  {
    href: "#/newsletter",
    img: icon,
    title: "Write a newsletter",
    by: "Newsletter Builder",
    text: "Newsletters, bulletins and 1-page bulletins in the Helvetic layout, from your notes or an existing Word file, ready as a Word document.",
    go: "Open the builder",
  },
];

export default function Landing() {
  return (
    <div className="landing">
      <header className="ld-head">
        <img src={logo} alt="helvetic airways" className="ld-logo" />
        <h1>Editorial tools</h1>
        <p>What would you like to write?</p>
      </header>
      <div className="ld-tiles">
        {TOOLS.map((t) => (
          <a key={t.href} href={t.href} className="ld-tile">
            <img src={t.img} alt="" className={"ld-img" + (t.round ? " round" : "")} />
            <span className="ld-by">{t.by}</span>
            <span className="ld-title">{t.title}</span>
            <span className="ld-text">{t.text}</span>
            <span className="ld-go">{t.go} &rarr;</span>
          </a>
        ))}
      </div>
    </div>
  );
}
