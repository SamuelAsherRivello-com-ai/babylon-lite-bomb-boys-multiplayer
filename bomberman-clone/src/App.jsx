import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createGame, stepGame, STEP } from './game/rules.js';
import { createGameRenderer } from './content/renderer.js';
import { createControls, createGestureHandlers } from './input/controls.js';
import versionText from '../../version.txt?raw';
import { Online } from './Online.jsx';
import { Viewport } from './ui/Viewport.jsx';
import { ArenaPlayers } from './ui/ArenaPlayers.jsx';
import { TopNav } from './ui/TopNav.jsx';
import { AudioSettings, useArcadeAudio } from './ui/AudioSettings.jsx';
import { cpuInput } from './game/cpu.js';
import { BattleOptions, PowerupLegend } from './ui/BattleOptions.jsx';
import { DeathView } from './game/death-view.js';
import { createScreenTransition } from './ui/screen-transition.js';
import { createWorldChangeQueue } from './game/world-change-queue.js';
import {
  DEFAULT_BATTLE_OPTIONS,
  clearLocalStorage,
  loadBattleOptions,
  loadBombFlash,
  loadOnlineMode,
  loadExplosionStyle,
  saveBattleOptions,
  saveBombFlash,
  saveOnlineMode,
  saveExplosionStyle,
} from './ui/preferences.js';

const PRACTICE_PLAYERS = [
  { color: 0, name: 'Mint', cpu: false },
  { color: 1, name: 'Amber', cpu: true },
  { color: 2, name: 'Violet', cpu: true },
  { color: 3, name: 'Rose', cpu: true },
];

export function App() {
  const [online, setOnline] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('room') || params.get('mode') !== 'offline') {
      if (params.has('room') || params.get('mode') === 'online') return true;
    }
    if (params.get('mode') === 'offline') return false;
    return loadOnlineMode();
  });
  const [coarsePointer, setCoarsePointer] = useState(() => matchMedia('(pointer: coarse)').matches);
  const [pendingMode, setPendingMode] = useState(null);
  const [modeTransition, setModeTransition] = useState({
    parent: 'game-world',
    type: 'screen-door',
    phase: 'idle',
    progress: 1,
    easedProgress: 1,
  });
  const modeTransitionRef = useRef(createScreenTransition());
  useEffect(() => {
    const pointer = matchMedia('(pointer: coarse)');
    const update = () => setCoarsePointer(pointer.matches);
    pointer.addEventListener('change', update);
    return () => pointer.removeEventListener('change', update);
  }, []);
  const aspect = coarsePointer ? 'portrait' : 'landscape';
  const requestMode = (nextOnline) => {
    if (nextOnline === online || pendingMode !== null) return;
    setPendingMode(nextOnline);
  };
  useEffect(() => {
    if (pendingMode === null) return undefined;
    let frame;
    const loop = (now) => {
      const transition = modeTransitionRef.current;
      transition.ensure(`mode:${pendingMode}`, { online: pendingMode }, now / 1000, {
        onUpdate: setModeTransition,
        onMiddle: () => {
          saveOnlineMode(pendingMode);
          setOnline(pendingMode);
          transition.continue();
        },
        onDone: () => setPendingMode(null),
      });
      transition.tick(now / 1000);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [pendingMode]);
  return (
    <>
      {online ? (
        <Online aspect={aspect} onExit={() => requestMode(false)} />
      ) : (
        <Practice aspect={aspect} onOnline={() => requestMode(true)} />
      )}
      <ModeScreenDoor transition={modeTransition} modeKey={online} />
    </>
  );
}

function ModeScreenDoor({ transition, modeKey }) {
  const [bounds, setBounds] = useState(null);
  useLayoutEffect(() => {
    const update = () => {
      const stage = document.querySelector('.arena-stage');
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      setBounds({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    };
    update();
    const stage = document.querySelector('.arena-stage');
    const observer = new ResizeObserver(update);
    if (stage) observer.observe(stage);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [modeKey, transition.phase]);
  if (!bounds || transition.phase === 'idle') return null;
  const progress = Math.max(0, Math.min(1, transition.easedProgress ?? 1));
  const opening = transition.phase === 'opening';
  const leftTransform = opening
    ? `translateX(${-100 * progress}%)`
    : `translateX(${-100 + 100 * progress}%)`;
  const rightTransform = opening
    ? `translateX(${100 * progress}%)`
    : `translateX(${100 - 100 * progress}%)`;
  return (
    <div
      className="screen-transition mode-screen-transition"
      data-parent={transition.parent}
      data-type={transition.type}
      data-phase={transition.phase}
      style={{
        ...bounds,
        '--screen-door-art': `url("${import.meta.env.BASE_URL}assets/door-half.png")`,
      }}
      aria-hidden="true"
    >
      <div className="screen-door screen-door-left" style={{ transform: leftTransform }} />
      <div className="screen-door screen-door-right" style={{ transform: rightTransform }} />
    </div>
  );
}
function Practice({ aspect, onOnline }) {
  const sound = useArcadeAudio();
  const [options, setOptions] = useState(loadBattleOptions),
    optionRef = useRef(options),
    brains = useRef(new Map()),
    death = useRef(new DeathView());
  const [frozen, setFrozen] = useState(false),
    [bombFlash, setBombFlash] = useState(loadBombFlash),
    flash = useRef(bombFlash),
    [explosionStyle, setExplosionStyle] = useState(loadExplosionStyle),
    explosion = useRef(explosionStyle);
  const [screenTransition, setScreenTransition] = useState({
    parent: 'game-world',
    type: 'screen-door',
    phase: 'idle',
    progress: 1,
    easedProgress: 1,
  });
  const changeFlash = (value) => {
    flash.current = value;
    setBombFlash(value);
    saveBombFlash(value);
    restart();
  };
  const changeExplosionStyle = (value) => {
    const next = value === 'pfx' ? 'pfx' : 'classic';
    explosion.current = next;
    setExplosionStyle(next);
    saveExplosionStyle(next);
    restart();
  };
  const canvas = useRef(null),
    screenTransitionRef = useRef(createScreenTransition()),
    worldChanges = useRef(createWorldChangeQueue()),
    worldVersion = useRef(0),
    game = useRef(
      createGame(
        ['practice', 'cpu:1', 'cpu:2', 'cpu:3'],
        1,
        options.map,
        options.plant,
        options.chainReaction,
      ),
    ),
    controls = useRef(null),
    gestures = useRef(null);
  if (!gestures.current) gestures.current = createGestureHandlers(controls);
  const [message, setMessage] = useState('Starting Babylon Lite…'),
    [paused, setPaused] = useState(false),
    [alive, setAlive] = useState(true),
    [settings, setSettings] = useState(false),
    [clearMessage, setClearMessage] = useState('');
  useEffect(() => {
    let cancelled = false,
      renderer,
      frame,
      last = 0,
      accumulator = 0;
    const input = createControls();
    controls.current = input;
    const loop = (now) => {
      if (cancelled) return;
      const nowSeconds = now / 1000;
      const queuedChange = worldChanges.current.peek();
      screenTransitionRef.current.ensure(
        queuedChange?.id ?? worldVersion.current,
        game.current,
        nowSeconds,
        {
          onUpdate: setScreenTransition,
          onSwap: () => {
            const request = worldChanges.current.consume(queuedChange?.id);
            if (!request) return null;
            worldVersion.current = request.id;
            game.current = createGame(
              ['practice', 'cpu:1', 'cpu:2', 'cpu:3'],
              1,
              request.options.map,
              request.options.plant,
              request.options.chainReaction,
            );
            brains.current.clear();
            death.current.reset();
            setFrozen(false);
            setPaused(false);
            setAlive(true);
            request.onDone?.();
            return game.current;
          },
          onMiddle: () => screenTransitionRef.current.continue(),
        },
      );
      screenTransitionRef.current.tick(nowSeconds);
      accumulator += Math.min((now - last) / 1000, 0.1);
      last = now;
      while (accumulator >= STEP) {
        if (!screenTransitionRef.current.isBlocking() && !death.current.frozen(now)) {
          const commands = { practice: input.read() };
          for (const p of game.current.players.slice(1))
            commands[p.id] = cpuInput(game.current, p.id, brains.current, optionRef.current.cpu);
          stepGame(game.current, commands);
        }
        accumulator -= STEP;
      }
      const shown = death.current.draw(game.current, 'practice', now);
      shown.bombFlash = flash.current;
      shown.explosionStyle = explosion.current;
      setFrozen(death.current.frozen(now));
      renderer.draw(screenTransitionRef.current.present(shown));
      sound.audio.current?.observe(game.current);
      setAlive(game.current.players[0].alive);
      frame = requestAnimationFrame(loop);
    };
    createGameRenderer(canvas.current)
      .then((r) => {
        renderer = r;
        if (cancelled) {
          r.dispose();
          return;
        }
        setMessage('');
        last = performance.now();
        frame = requestAnimationFrame(loop);
      })
      .catch((error) => {
        if (!cancelled) setMessage(error.message);
      });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      input.dispose();
      gestures.current?.dispose();
      renderer?.dispose();
      controls.current = null;
    };
  }, []);
  const pause = (value) => {
    game.current.paused = value;
    controls.current?.clear();
    setPaused(value);
  };
  const restart = () => {
    controls.current?.clear();
    worldChanges.current.request({
      type: 'reset-world',
      options: optionRef.current,
    });
    setSettings(false);
  };
  const clearSettings = () => {
    clearLocalStorage();
    const defaults = { ...DEFAULT_BATTLE_OPTIONS };
    optionRef.current = defaults;
    setOptions(defaults);
    flash.current = true;
    setBombFlash(true);
    explosion.current = 'classic';
    setExplosionStyle('classic');
    saveExplosionStyle('classic');
    sound.reset();
    restart();
    pause(true);
    setSettings(true);
    setClearMessage('Local storage cleared.');
  };
  const changeBattleOptions = (patch) => {
    const next = { ...optionRef.current, ...patch };
    optionRef.current = next;
    setOptions(next);
    saveBattleOptions(next);
    setClearMessage('');
    restart();
  };
  const toggleSettings = () => {
    setClearMessage('');
    setSettings(!settings);
    pause(!settings);
  };
  return (
    <Viewport aspect={aspect}>
      <div
        className="game-layout"
        style={{
          '--arena-columns': game.current.width,
          '--arena-rows': game.current.height,
        }}
      >
        <div className="game-view arena-slot">
          <ArenaPlayers
            players={PRACTICE_PLAYERS}
            canvas={canvas}
            gestures={gestures.current}
            arenaLabel="Bomberman practice arena"
            mapWidth={game.current.width}
            mapHeight={game.current.height}
            localPlayerColor={0}
            transitionState={screenTransition}
          />
        </div>
        <section
          className="menu-view game-panel practice-menu-view practice-game-panel"
          data-information-panel
          {...gestures.current.panel}
        >
          <div className="panel-content">
            <section className="menu-section menu-section-controls">
              <BattleOptions
                options={options}
                onChange={changeBattleOptions}
                bombFlash={bombFlash}
                onBombFlash={changeFlash}
                explosionStyle={explosionStyle}
                onExplosionStyle={changeExplosionStyle}
                mode="offline"
                onModeChange={onOnline}
              />
            </section>
            <section className="menu-section menu-section-powerups">
              <PowerupLegend />
            </section>
            <div className="instructions menu-section menu-section-instructions">
              MOVE <kbd>WASD</kbd> / <kbd>↑↓←→</kbd> · BOMB <kbd>SPACE</kbd> · GAMEPAD: STICK /
              D-PAD + FACE BUTTON
              <span>Place. Escape. Repeat.</span>
            </div>
          </div>
          <footer className="panel-footer menu-section menu-section-footer">
            <section className="corner corner_bottom_left">
              <button onClick={toggleSettings}>⚙ Settings</button>
            </section>
            <div className="corner corner_bottom_right">
              v{versionText.trim().replace(/^version=/, '')}
              <span>LOCAL PRACTICE</span>
            </div>
          </footer>
          {settings && (
            <div className="overlay settings-overlay">
              <div className="settings-content">
                <h2>Settings</h2>
                <TopNav online={false} />
                <AudioSettings sound={sound} />
                <button
                  onClick={() => {
                    const operation = document.fullscreenElement
                      ? document.exitFullscreen()
                      : document.documentElement.requestFullscreen();
                    operation?.catch(() =>
                      setMessage('Fullscreen is unavailable in this browser.'),
                    );
                  }}
                >
                  Fullscreen
                </button>
                <button onClick={clearSettings}>Clear Local Storage</button>
                {clearMessage && <p role="status">{clearMessage}</p>}
                <button className="settings-back-button" onClick={toggleSettings}>
                  Back
                </button>
              </div>
            </div>
          )}
          {message && (
            <div className="overlay" role="status">
              <h2>Getting ready</h2>
              <p>{message}</p>
              {message !== 'Starting Babylon Lite…' && (
                <button onClick={() => location.reload()}>Try graphics again</button>
              )}
            </div>
          )}
          {!message && !alive && !frozen && (
            <div className="overlay">
              <span className="eyebrow">CAUGHT IN THE CROSSFIRE</span>
              <h2>One more round?</h2>
              <p>Escape before your bomb explodes.</p>
              <button onClick={restart}>Try again ↗</button>
            </div>
          )}
          {!message && paused && alive && !settings && (
            <div className="overlay">
              <h2>Take a breather</h2>
              <button
                onClick={() => {
                  setSettings(false);
                  pause(false);
                }}
              >
                Resume
              </button>
            </div>
          )}
        </section>
      </div>
    </Viewport>
  );
}
