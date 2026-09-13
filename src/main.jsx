import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Wheat,
  Trees,
  Mountain,
  Users,
  Sun,
  Pause,
  Play,
  FastForward,
  Plus,
  Minus,
  Compass,
  HelpCircle,
  Save,
  X,
  Check,
  ArrowUpRight,
  RotateCw,
  MousePointer2,
  Grid2X2,
  Leaf,
  House,
  Hammer,
  ChevronDown,
  Volume2,
} from "lucide-react";
import { Village, CATALOG } from "./world";
import "./style.css";
const resourceIcons = { wood: Trees, stone: Mountain, food: Wheat };
function Resource({ type, value }) {
  const Icon = resourceIcons[type];
  return (
    <div
      className={`resource ${type}`}
      title={`${type[0].toUpperCase() + type.slice(1)} in storage`}
    >
      <span className="resource-icon">
        <Icon size={23} strokeWidth={1.7} />
      </span>
      <div>
        <small>{type}</small>
        <strong>{Math.floor(value || 0)}</strong>
      </div>
    </div>
  );
}
function App() {
  const worldRef = useRef(),
    game = useRef();
  const [state, setState] = useState({
    resources: { wood: 140, stone: 95, food: 80 },
    population: 8,
    capacity: 16,
    day: 1,
    speed: 1,
    buildings: [],
    created: {},
    gathered: 0,
  });
  const [loaded, setLoaded] = useState(false),
    [error, setError] = useState(null),
    [thumbs, setThumbs] = useState({}),
    [selected, setSelected] = useState(null),
    [hover, setHover] = useState(null),
    [detail, setDetail] = useState(null),
    [toast, setToast] = useState(null),
    [help, setHelp] = useState(false),
    [goals, setGoals] = useState(true),
    [grid, setGrid] = useState(false),
    [menu, setMenu] = useState(false),
    [reset, setReset] = useState(false);
  const toastTimer = useRef();
  const notify = (message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4200);
  };
  useEffect(() => {
    game.current = new Village(
      worldRef.current,
      setState,
      notify,
      setDetail,
      (images, err) => {
        setThumbs(images);
        setError(err);
        setLoaded(true);
      },
    );
    return () => {
      game.current.dispose();
      clearTimeout(toastTimer.current);
    };
  }, []);
  const choose = (type) => {
    if (!loaded || error) return;
    const next = type === selected ? null : type;
    setSelected(next);
    setDetail(null);
    game.current.select(next);
    setGrid(!!next);
  };
  const cancel = () => {
    setSelected(null);
    game.current?.select(null);
    setGrid(false);
  };
  const speed = (s) => {
    game.current.speed = s;
    game.current.emit();
  };
  useEffect(() => {
    const key = (e) => {
      if (e.target.tagName === "INPUT") return;
      if (e.code === "Escape") {
        cancel();
        setDetail(null);
        setHelp(false);
        setReset(false);
        setMenu(false);
      }
      if (help || reset) return;
      if (e.code === "Space") {
        e.preventDefault();
        speed(game.current.speed ? 0 : 1);
      }
      if (e.code === "KeyR") game.current.rotate();
      if (e.code === "KeyG") {
        game.current.grid.visible = !game.current.grid.visible;
        setGrid(game.current.grid.visible);
      }
      if (e.code === "KeyB") choose("house");
      if (e.key === "+" || e.key === "=") game.current.zoom(0.15);
      if (e.key === "-") game.current.zoom(-0.15);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [selected, loaded, help, reset]);
  const inspected = detail && state.buildings.find((b) => b.id === detail.id);
  const activeType = selected || hover;
  const active = CATALOG[activeType];
  const builtHouse =
    state.buildings.filter((b) => b.type === "house" && b.progress === 1)
      .length > 3;
  const builtFarm =
    state.buildings.filter((b) => b.type === "farm" && b.progress === 1)
      .length > 1;
  const allGoals = builtHouse && builtFarm && state.gathered >= 100;
  return (
    <main className="game-shell">
      <div
        ref={worldRef}
        className={`world ${selected ? "is-building" : ""}`}
        aria-label="Interactive 3D village. Drag to pan, scroll to zoom, right-drag to orbit."
      />
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Leaf size={30} strokeWidth={1.35} />
          </div>
          <div>
            <h1>
              Hearth <span>&</span> Hamlet
            </h1>
            <p>A LITTLE WORLD OF YOUR OWN</p>
          </div>
        </div>
        <div className="resources">
          <Resource type="wood" value={state.resources.wood} />
          <Resource type="stone" value={state.resources.stone} />
          <Resource type="food" value={state.resources.food} />
          <div
            className="resource population"
            title="Villagers / housing capacity"
          >
            <span className="resource-icon">
              <Users size={23} strokeWidth={1.7} />
            </span>
            <div>
              <small>villagers</small>
              <strong>
                {state.population}
                <em> / {state.capacity}</em>
              </strong>
            </div>
          </div>
        </div>
        <div className="day">
          <Sun size={27} strokeWidth={1.5} />
          <div>
            <strong>Day {state.day}</strong>
            <small>Early summer</small>
          </div>
        </div>
        <button
          className="icon-button menu-button"
          aria-label="Open village menu"
          onClick={() => setMenu(!menu)}
        >
          <ChevronDown size={19} />
        </button>
      </header>
      <section className="left-stack">
        <div className="village-label">
          <span className="live-dot" /> YOUR SETTLEMENT{" "}
          <span className="label-line" />
        </div>
        <div className="village-heading">
          <h2>Willowbrook</h2>
          <span>A humble beginning</span>
        </div>
        <div className="objectives parchment">
          <button
            className="objective-heading"
            onClick={() => setGoals(!goals)}
          >
            <span>
              <Leaf size={17} /> A place to call home
            </span>
            <ChevronDown size={16} className={goals ? "" : "collapsed"} />
          </button>
          {goals && (
            <>
              <p>
                {allGoals
                  ? "Your little hamlet is flourishing. Keep growing!"
                  : "Every great village starts with a few small things."}
              </p>
              <div className={`goal ${builtHouse ? "done" : ""}`}>
                <span className="checkbox">
                  {builtHouse && <Check size={12} />}
                </span>
                <span>Build a cottage</span>
                <span className="goal-count">{builtHouse ? "1" : "0"}/1</span>
              </div>
              <div className={`goal ${builtFarm ? "done" : ""}`}>
                <span className="checkbox">
                  {builtFarm && <Check size={12} />}
                </span>
                <span>Establish a farm</span>
                <span className="goal-count">{builtFarm ? "1" : "0"}/1</span>
              </div>
              <div className={`goal ${state.gathered >= 100 ? "done" : ""}`}>
                <span className="checkbox">
                  {state.gathered >= 100 && <Check size={12} />}
                </span>
                <span>Gather timber</span>
                <span className="goal-count">
                  {Math.min(state.gathered, 100)}/100
                </span>
              </div>
              <div className="goal-progress">
                <i
                  style={{
                    width: `${(((builtHouse ? 1 : 0) + (builtFarm ? 1 : 0) + Math.min(state.gathered / 100, 1)) / 3) * 100}%`,
                  }}
                />
              </div>
              <div className="objective-footer">
                <span>GROW AT YOUR OWN PACE</span>
                <Wheat size={15} />
              </div>
            </>
          )}
        </div>
        <div className="settlement-status">
          <span className="live-dot" />
          {state.speed === 0
            ? "A quiet moment. Time is paused."
            : state.buildings.some((b) => b.progress < 1)
              ? "Your builders are at work."
              : "Your villagers are settling in."}
        </div>
      </section>
      <div className="top-right">
        <div className="time-controls parchment">
          <button
            className={state.speed === 0 ? "active" : ""}
            onClick={() => speed(state.speed === 0 ? 1 : 0)}
            title="Pause / resume (Space)"
            aria-label={
              state.speed === 0 ? "Resume simulation" : "Pause simulation"
            }
          >
            {state.speed === 0 ? <Play size={16} /> : <Pause size={16} />}
          </button>
          <span />
          <button
            className={state.speed === 1 ? "active" : ""}
            onClick={() => speed(1)}
          >
            1×
          </button>
          <button
            className={state.speed === 2 ? "active" : ""}
            onClick={() => speed(2)}
          >
            2×
          </button>
          <button
            className={state.speed === 4 ? "active" : ""}
            onClick={() => speed(4)}
          >
            4×
          </button>
        </div>
        <div className="season-caption">
          <span className="live-dot" />{" "}
          {state.speed === 0 ? "PAUSED" : "VILLAGE LIFE"}
        </div>
      </div>
      {detail && !selected && (
        <aside className="inspector parchment">
          <div className="inspector-top">
            <span>IN YOUR VILLAGE</span>
            <button
              className="bare"
              onClick={() => setDetail(null)}
              aria-label="Close building details"
            >
              <X size={17} />
            </button>
          </div>
          {thumbs[detail.type] && <img src={thumbs[detail.type]} alt="" />}
          <h3>{detail.name}</h3>
          <p>{detail.description}</p>
          <div className="effect">
            <Leaf size={15} />
            {detail.effect}
          </div>
          <div className="detail-stats">
            <span>
              Status
              <strong>
                {inspected?.progress < 1
                  ? `Building · ${Math.floor(inspected.progress * 100)}%`
                  : "Complete"}
              </strong>
            </span>
            <span>
              Assigned workers<strong>{inspected?.workers || 0}</strong>
            </span>
            {CATALOG[detail.type]?.resource && (
              <span>
                Deliveries<strong>{inspected?.cycles || 0}</strong>
              </span>
            )}
          </div>
        </aside>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
      <div className="bottom-left">
        <button
          className="compass"
          onClick={() => game.current.home()}
          title="Return to village center"
          aria-label="Center camera"
        >
          <span>N</span>
          <Compass size={38} strokeWidth={1} />
        </button>
        <button
          className="help-button parchment"
          aria-label="How to play"
          onClick={() => setHelp(true)}
        >
          <HelpCircle size={15} />
          <span>How to play</span>
        </button>
      </div>
      <div className="build-area">
        {active && (
          <div className="build-tooltip parchment">
            <div>
              <span className="tooltip-category">
                {selected ? "PLAN YOUR NEXT BUILDING" : "GROW YOUR VILLAGE"}
              </span>
              <h3>{active.name}</h3>
              <p>{active.description}</p>
              <span className="effect">
                <Leaf size={14} />
                {active.effect}
              </span>
            </div>
            <div className="tooltip-cost">
              <span>BUILD COST</span>
              {Object.entries(active.cost).map(([r, n]) => {
                const Icon = resourceIcons[r];
                return (
                  <div
                    key={r}
                    className={state.resources[r] < n ? "unaffordable" : ""}
                  >
                    <Icon size={16} />
                    <strong>{n}</strong>
                    <span>{r}</span>
                  </div>
                );
              })}
              <small>
                {active.seconds
                  ? `${active.seconds}s construction`
                  : "Placed instantly"}
              </small>
            </div>
          </div>
        )}
        {selected ? (
          <div
            className={`placement-hint ${state.placement?.ok === false ? "invalid" : ""}`}
          >
            <MousePointer2 size={14} />
            <span>
              {state.placement?.reason ||
                "Choose a clear patch of land to build"}
            </span>
            <button
              onClick={() => game.current.rotate()}
              title="Rotate building (R)"
            >
              <RotateCw size={14} />
              <kbd>R</kbd>
            </button>
            <button onClick={cancel}>
              <X size={14} />
              <kbd>ESC</kbd>
            </button>
          </div>
        ) : (
          <div className="build-title">
            <span />
            <Hammer size={14} />
            <span>MAKE YOURSELF AT HOME</span>
            <span />
          </div>
        )}
        <nav className="build-palette parchment" aria-label="Choose a building">
          {Object.entries(CATALOG).map(([type, c], i) => (
            <button
              key={type}
              aria-label={`Build ${c.name}`}
              aria-pressed={selected === type}
              className={`build-card ${selected === type ? "selected" : ""}`}
              onClick={() => choose(type)}
              onMouseEnter={() => setHover(type)}
              onMouseLeave={() => setHover(null)}
              disabled={!loaded || !!error}
            >
              <span className="building-number">0{i + 1}</span>
              {thumbs[type] ? (
                <img src={thumbs[type]} alt="" />
              ) : (
                <House size={28} />
              )}
              <span className="building-name">{c.name}</span>
              {selected === type && <i />}
            </button>
          ))}
        </nav>
        <div className="bottom-caption">
          <span>
            <MousePointer2 size={11} /> Drag to explore
          </span>
          <i>·</i>
          <span>Scroll to zoom</span>
          <i>·</i>
          <span>Right-drag to orbit</span>
          <span className="autosave">
            <span className="live-dot" /> Autosaved locally
          </span>
        </div>
      </div>
      <div className="bottom-right">
        <button
          className={`icon-button parchment ${grid ? "active" : ""}`}
          onClick={() => {
            game.current.grid.visible = !game.current.grid.visible;
            setGrid(game.current.grid.visible);
          }}
          title="Toggle grid (G)"
          aria-label="Toggle building grid"
        >
          <Grid2X2 size={19} />
        </button>
        <div className="zoom-controls parchment">
          <button aria-label="Zoom in" onClick={() => game.current.zoom(0.15)}>
            <Plus size={20} />
          </button>
          <span />
          <button
            aria-label="Zoom out"
            onClick={() => game.current.zoom(-0.15)}
          >
            <Minus size={20} />
          </button>
        </div>
      </div>
      {menu && (
        <div className="menu parchment">
          <button
            onClick={() => {
              if (game.current.save()) notify("Your village has been saved.");
              setMenu(false);
            }}
          >
            <Save size={16} />
            Save village
          </button>
          <button
            onClick={() => {
              setHelp(true);
              setMenu(false);
            }}
          >
            <HelpCircle size={16} />
            How to play
          </button>
          <button
            onClick={() => {
              setReset(true);
              setMenu(false);
            }}
          >
            <RotateCw size={16} />
            Start a new village
          </button>
        </div>
      )}
      {(help || reset) && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setHelp(false);
            setReset(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={reset ? "Start a new village" : "How to play"}
            className="modal parchment"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close bare"
              aria-label="Close dialog"
              onClick={() => {
                setHelp(false);
                setReset(false);
              }}
            >
              <X size={20} />
            </button>
            <Leaf size={30} className="modal-leaf" />
            {reset ? (
              <>
                <h2>A fresh beginning?</h2>
                <p>
                  This replaces your saved village with the original settlement.
                </p>
                <div className="modal-actions">
                  <button onClick={() => setReset(false)}>
                    Keep my village
                  </button>
                  <button
                    className="primary"
                    onClick={() => {
                      game.current.ready = false;
                      localStorage.removeItem("hearth-v1");
                      window.location.reload();
                    }}
                  >
                    Start fresh
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2>A little world, in your hands.</h2>
                <p>
                  Build slowly. Watch your people work. Make Willowbrook a place
                  to call home.
                </p>
                <div className="help-row">
                  <MousePointer2 />
                  <div>
                    <strong>Explore your village</strong>
                    <span>
                      Drag to pan, scroll to zoom, and right-drag to orbit. The
                      compass brings you home.
                    </span>
                  </div>
                </div>
                <div className="help-row">
                  <Hammer />
                  <div>
                    <strong>Make room for something new</strong>
                    <span>
                      Choose a building below. A green preview means it fits.
                      Click to place, R to rotate, Esc to cancel.
                    </span>
                  </div>
                </div>
                <div className="help-row">
                  <Users />
                  <div>
                    <strong>Let your villagers take care of it</strong>
                    <span>
                      Workers travel to jobs, build new structures, and deliver
                      wood, stone, and food. Cottages welcome two new workers.
                    </span>
                  </div>
                </div>
                <div className="help-row">
                  <Wheat />
                  <div>
                    <strong>Grow a thriving settlement</strong>
                    <span>
                      Farms produce food, lumberyards supply wood, and mines
                      gather stone. Windmills turn 2 food into 8. Paths speed up
                      travel.
                    </span>
                  </div>
                </div>
                <div className="help-note">
                  Space to pause · G for grid · Your village saves automatically
                  in this browser.
                </div>
                <button className="primary full" onClick={() => setHelp(false)}>
                  Back to Willowbrook <ArrowUpRight size={16} />
                </button>
              </>
            )}
          </section>
        </div>
      )}
      {!loaded && (
        <div className="loading-screen">
          <Leaf size={40} strokeWidth={1} />
          <h2>A new beginning.</h2>
          <p>Planting trees. Raising rooftops. Waking the village.</p>
          <span className="loading-line" />
        </div>
      )}
      {error && (
        <div className="loading-screen">
          <h2>The village couldn’t load.</h2>
          <p>Please reload to try loading the 3D models again.</p>
          <button className="primary" onClick={() => location.reload()}>
            Try again
          </button>
        </div>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")).render(<App />);
