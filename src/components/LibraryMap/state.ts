// Page-local UI state for the Library Map (useReducer; nothing goes into AppContext).
import type { PaperFlag } from '../../types';
import type { ShownLens } from './format';
import { readPrefs } from './hooks';
import { DEFAULT_FILTERS, FLAG_ORDER, groupKey, type GroupRef, type MapFilters } from './mapModel';
import type { ColorBy } from './mapRenderer';

/** page tabs (v2.1-P); the table is a view inside the Map tab */
export type Tab = 'map' | 'overview' | 'engineering';
export type MapView = 'map' | 'table';

export type Panel = { kind: 'paper'; index: number } | { kind: 'group'; group: GroupRef };

export type Overlay =
  | { kind: 'compare'; a: number; b: number }
  | { kind: 'passages'; ids: string[]; title: string; subtitle?: string };

export interface UiState {
  tab: Tab;
  /** tabs opened so far: they stay mounted (hidden) so their state survives a switch */
  visited: Tab[];
  view: MapView;
  colorBy: ColorBy;
  showLinks: boolean;
  /** flags highlighted in the Needs-attention color mode and used by the table's flag filter */
  attentionFlags: PaperFlag[];
  /** table: only rows with one of attentionFlags */
  tableFlaggedOnly: boolean;
  panel: Panel | null;
  /** panels to go back to (paper -> neighbor, topic -> member, ...) */
  history: Panel[];
  /** chosen neighbor lens; null = the paper's default (Methods when it has one, else Content) */
  lens: ShownLens | null;
  /** a paper emphasized from a panel row or a search result */
  focus: number | null;
  overlay: Overlay | null;
  filters: MapFilters;
  search: string;
  /** a camera request; the nonce makes repeated requests for one paper distinct */
  fly: { index: number; nonce: number } | null;
  /** "Show on map" for a topic: frame its papers */
  fitGroup: { group: GroupRef; nonce: number } | null;
}

export type UiAction =
  | { type: 'tab'; tab: Tab }
  | { type: 'view'; view: MapView }
  | { type: 'colorBy'; colorBy: ColorBy }
  | { type: 'links'; on: boolean }
  | { type: 'attentionFlags'; flags: PaperFlag[] }
  | { type: 'tableFlaggedOnly'; on: boolean }
  | { type: 'selectPaper'; index: number; fly?: boolean; push?: boolean }
  | { type: 'openGroup'; group: GroupRef; push?: boolean; showOnMap?: boolean }
  | { type: 'back' }
  | { type: 'closePanel' }
  | { type: 'lens'; lens: ShownLens }
  | { type: 'focus'; index: number | null }
  | { type: 'openCompare'; a: number; b: number }
  | { type: 'openPassages'; ids: string[]; title: string; subtitle?: string }
  | { type: 'closeOverlay' }
  | { type: 'filters'; patch: Partial<MapFilters> }
  | { type: 'resetFilters' }
  | { type: 'search'; value: string }
  | { type: 'showAttention' };

export interface ViewPrefs {
  tab: Tab;
  view: MapView;
  colorBy: ColorBy;
  showLinks: boolean;
}

const DEFAULT_PREFS: ViewPrefs = { tab: 'map', view: 'map', colorBy: 'topic', showLinks: false };
const COLOR_MODES: readonly ColorBy[] = ['topic', 'year', 'cited', 'attention'];
const TABS: readonly Tab[] = ['map', 'overview', 'engineering'];

export function initUi(): UiState {
  const prefs = readPrefs(DEFAULT_PREFS);
  const tab = TABS.includes(prefs.tab) ? prefs.tab : 'map';
  return {
    tab,
    visited: tab === 'map' ? ['map'] : ['map', tab],
    view: prefs.view === 'table' ? 'table' : 'map',
    colorBy: COLOR_MODES.includes(prefs.colorBy) ? prefs.colorBy : 'topic',
    showLinks: prefs.showLinks === true,
    attentionFlags: [...FLAG_ORDER],
    tableFlaggedOnly: false,
    panel: null,
    history: [],
    lens: null,
    focus: null,
    overlay: null,
    filters: DEFAULT_FILTERS,
    search: '',
    fly: null,
    fitGroup: null,
  };
}

function samePanel(a: Panel | null, b: Panel | null): boolean {
  if (!a || !b) return a === b;
  if (a.kind === 'paper' && b.kind === 'paper') return a.index === b.index;
  if (a.kind === 'group' && b.kind === 'group') return groupKey(a.group) === groupKey(b.group);
  return false;
}

function open(state: UiState, panel: Panel, push: boolean): UiState {
  if (samePanel(state.panel, panel)) return state;
  const history = push && state.panel ? [...state.history, state.panel].slice(-20) : [];
  return { ...state, panel, history, focus: null };
}

export function uiReducer(state: UiState, action: UiAction): UiState {
  switch (action.type) {
    case 'tab':
      return { ...state, tab: action.tab, visited: state.visited.includes(action.tab) ? state.visited : [...state.visited, action.tab] };
    case 'view':
      return { ...state, view: action.view };
    case 'colorBy':
      return { ...state, colorBy: action.colorBy };
    case 'links':
      return { ...state, showLinks: action.on };
    case 'attentionFlags':
      return { ...state, attentionFlags: FLAG_ORDER.filter((f) => action.flags.includes(f)) };
    case 'tableFlaggedOnly':
      return { ...state, tableFlaggedOnly: action.on };
    case 'selectPaper': {
      const next = open(state, { kind: 'paper', index: action.index }, action.push ?? false);
      // a fresh selection starts on the paper's default lens; following a neighbor keeps the lens
      const withLens = action.push ? next : { ...next, lens: null };
      return action.fly ? { ...withLens, tab: 'map', view: 'map', fly: { index: action.index, nonce: (state.fly?.nonce ?? 0) + 1 } } : withLens;
    }
    case 'openGroup': {
      const next = open(state, { kind: 'group', group: action.group }, action.push ?? false);
      return action.showOnMap
        ? { ...next, tab: 'map', view: 'map', fitGroup: { group: action.group, nonce: (state.fitGroup?.nonce ?? 0) + 1 } }
        : next;
    }
    case 'back': {
      if (!state.history.length) return { ...state, panel: null, focus: null };
      const history = state.history.slice(0, -1);
      return { ...state, panel: state.history[state.history.length - 1], history, focus: null };
    }
    case 'closePanel':
      return state.panel ? { ...state, panel: null, history: [], focus: null } : state;
    case 'lens':
      return { ...state, lens: action.lens, focus: null };
    case 'focus':
      return state.focus === action.index ? state : { ...state, focus: action.index };
    case 'openCompare':
      return { ...state, overlay: { kind: 'compare', a: action.a, b: action.b }, focus: null };
    case 'openPassages':
      return { ...state, overlay: { kind: 'passages', ids: action.ids, title: action.title, subtitle: action.subtitle } };
    case 'closeOverlay':
      return { ...state, overlay: null };
    case 'filters':
      return { ...state, filters: { ...state.filters, ...action.patch } };
    case 'resetFilters':
      return { ...state, filters: DEFAULT_FILTERS };
    case 'search':
      return { ...state, search: action.value };
    case 'showAttention':
      return { ...state, tab: 'map', view: 'map', colorBy: 'attention' };
    default:
      return state;
  }
}
