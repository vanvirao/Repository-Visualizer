import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import HeroGraph, { HERO_LEGEND, HERO_STATS } from "./HeroGraph";

const EXAMPLES = ["expressjs/express", "koajs/koa"];

const STEPS = [
  {
    number: "01",
    title: "Parse",
    text: "Reads every file and pulls out its functions, classes and imports.",
  },
  {
    number: "02",
    title: "Map",
    text: "Turns imports into a dependency graph, so you can see who relies on whom.",
  },
  {
    number: "03",
    title: "Explore",
    text: "Hover to trace connections. Click a file to see what it imports and what imports it.",
  },
];

const LANGUAGES = ["Python", "JavaScript", "TypeScript", "Java", "C++"];

const WORDS = ["Understand", "any", "codebase."];

function Landing({ githubUrl, setGithubUrl, onAnalyze, error }) {
  const reduce = useReducedMotion();

  // Mouse position over the hero drives a subtle 3D tilt on the preview.
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const spring = { stiffness: 70, damping: 16 };
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-5, 5]), spring);
  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [4, -4]), spring);

  const handleMove = (event) => {
    if (reduce) return;
    const rect = event.currentTarget.getBoundingClientRect();
    mouseX.set((event.clientX - rect.left) / rect.width - 0.5);
    mouseY.set((event.clientY - rect.top) / rect.height - 0.5);
  };

  const handleLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  const enter = (delay, y = 18) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.55, delay, ease: "easeOut" },
        };

  const drift = (x, y, duration) =>
    reduce
      ? {}
      : {
          animate: { x: [0, x, 0], y: [0, y, 0] },
          transition: { duration, repeat: Infinity, ease: "easeInOut" },
        };

  return (
    <main className="landing-page">
      <motion.div className="glow glow-a" aria-hidden="true" {...drift(36, -24, 16)} />
      <motion.div className="glow glow-b" aria-hidden="true" {...drift(-30, 26, 19)} />

      <div className="landing-inner">
        <section className="hero" onMouseMove={handleMove} onMouseLeave={handleLeave}>
          <div className="hero-copy">
            <motion.div className="landing-brand" {...enter(0, -12)}>
              REPOSITORY VISUALIZER
            </motion.div>

            <motion.div className="github-label" {...enter(0.08, 12)}>
              GITHUB REPOSITORY
            </motion.div>

            <h1 aria-label="Understand any codebase.">
              {WORDS.map((word, i) => (
                <span className="word-mask" key={word} aria-hidden="true">
                  <motion.span
                    className={`word ${i === 2 ? "word-accent" : ""}`}
                    initial={reduce ? false : { y: "110%" }}
                    animate={{ y: 0 }}
                    transition={{
                      duration: 0.65,
                      delay: 0.14 + i * 0.09,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  >
                    {word}
                    {i === 2 && (
                      <svg
                        className="word-underline"
                        viewBox="0 0 200 8"
                        preserveAspectRatio="none"
                      >
                        <motion.path
                          d="M2 5 C 50 1, 120 7, 198 3"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          initial={reduce ? false : { pathLength: 0 }}
                          animate={{ pathLength: 1 }}
                          transition={{ duration: 0.8, delay: 0.85, ease: "easeOut" }}
                        />
                      </svg>
                    )}
                  </motion.span>
                </span>
              ))}
            </h1>

            <motion.p {...enter(0.3)}>
              Paste a public GitHub repository URL to explore its structure and
              dependencies.
            </motion.p>

            <motion.div className="github-input-row" {...enter(0.38)}>
              <input
                type="text"
                value={githubUrl}
                onChange={(event) => setGithubUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onAnalyze();
                }}
                placeholder="https://github.com/username/repository"
                aria-label="GitHub repository URL"
              />
              <button onClick={() => onAnalyze()}>
                ANALYZE <span className="button-arrow">→</span>
              </button>
            </motion.div>

            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}

            <motion.div className="examples" {...enter(0.46, 10)}>
              <span>Or try</span>
              {EXAMPLES.map((repo) => (
                <button
                  key={repo}
                  onClick={() => onAnalyze(`https://github.com/${repo}`)}
                >
                  {repo}
                </button>
              ))}
            </motion.div>
          </div>

          <motion.div
            className="hero-visual"
            {...(reduce
              ? {}
              : {
                  initial: { opacity: 0, y: 34 },
                  animate: { opacity: 1, y: 0 },
                  transition: { duration: 0.8, delay: 0.25, ease: "easeOut" },
                })}
            style={{ rotateX, rotateY, transformPerspective: 1300 }}
          >
            <motion.div
              className="hero-panel"
              {...(reduce
                ? {}
                : {
                    animate: { y: [0, -7, 0] },
                    transition: { duration: 7, repeat: Infinity, ease: "easeInOut" },
                  })}
            >
              <div className="panel-bar">
                <strong>acme/storefront</strong>
                <span>
                  {HERO_STATS.files} files · {HERO_STATS.dependencies} dependencies
                </span>
              </div>

              <div className="panel-canvas">
                <HeroGraph />
              </div>

              <div className="panel-foot">
                <div className="panel-legend">
                  {HERO_LEGEND.map((item) => (
                    <span key={item.label}>
                      <i
                        style={{
                          background: item.color.fill,
                          borderColor: item.color.border,
                        }}
                      />
                      {item.label}
                    </span>
                  ))}
                </div>
                <span className="panel-hint">Hover a file</span>
              </div>
            </motion.div>
          </motion.div>
        </section>

        <section className="how" aria-label="How it works">
          {STEPS.map((step, i) => (
            <motion.div
              className="step"
              key={step.number}
              {...(reduce
                ? {}
                : {
                    initial: { opacity: 0, y: 22 },
                    whileInView: { opacity: 1, y: 0 },
                    viewport: { once: true, margin: "-50px" },
                    transition: { duration: 0.55, delay: i * 0.1, ease: "easeOut" },
                  })}
            >
              <div className="step-number">{step.number}</div>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </motion.div>
          ))}
        </section>

        <footer className="landing-footer">
          <span>Reads</span>
          {LANGUAGES.map((language) => (
            <span className="language" key={language}>
              {language}
            </span>
          ))}
        </footer>
      </div>
    </main>
  );
}

export default Landing;