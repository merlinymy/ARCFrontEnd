import type { AnswerMode, EffortLevel, ResponseMode } from '../../types';
import type { CitationStyle, EntryKind } from '../../types/bibliography';
import type { WritingRequestBody, WritingTask } from '../../types/writing';

export interface PickedPaper {
  id: string;
  title: string;
  kind: EntryKind;
}

type TriState = '' | 'on' | 'off';

/** Everything the form holds. One object for all five tasks, so the notes survive a switch of task. */
export interface WritingFormState {
  text: string;
  title: string;
  papers: PickedPaper[];
  /** Store the result as a conversation (history, projects). */
  persist: boolean;
  // model-backed tasks
  effort: EffortLevel;
  /** '' = the task's own default stance. */
  mode: '' | AnswerMode;
  responseMode: ResponseMode;
  generalKnowledge: boolean;
  useProfile: boolean;
  citationCheck: TriState;
  sections: string;
  paperType: string;
  audience: string;
  numAims: string;
  mechanism: string;
  // retrieval tasks
  style: '' | CitationStyle;
  inputKind: 'auto' | 'paragraph' | 'outline';
  refsPerPosition: string;
  maxPositions: string;
  includeReferences: boolean;
  citeAll: boolean;
  yearMin: string;
  yearMax: string;
  maxJournals: string;
}

export const DEFAULT_FORM: WritingFormState = {
  text: '',
  title: '',
  papers: [],
  persist: true,
  effort: 'high',
  mode: '',
  responseMode: 'detailed',
  generalKnowledge: true,
  useProfile: true,
  citationCheck: '',
  sections: '',
  paperType: '',
  audience: '',
  numAims: '3',
  mechanism: '',
  style: '',
  inputKind: 'auto',
  refsPerPosition: '',
  maxPositions: '',
  includeReferences: true,
  citeAll: false,
  yearMin: '',
  yearMax: '',
  maxJournals: '',
};

function intOrUndefined(value: string, min: number, max: number): number | undefined {
  const n = Number(value);
  return value.trim() !== '' && Number.isInteger(n) && n >= min && n <= max ? n : undefined;
}

function year(value: string): number | undefined {
  return /^\d{4}$/.test(value.trim()) ? Number(value) : undefined;
}

/** The request body for `task`: only the fields that task takes, and only the ones the user set. */
export function buildRequest(task: WritingTask, f: WritingFormState, projectId: string | null): WritingRequestBody {
  const generate = task === 'outline' || task === 'questions' || task === 'aims';
  // Reference-only entries have no text to send whole or to filter retrieval by: the model tasks take PDF papers only.
  const picked = f.papers.filter((p) => !generate || p.kind === 'paper').map((p) => p.id);
  const body: WritingRequestBody = {
    text: f.text.trim(),
    title: f.title.trim() || null,
    paper_ids: picked.length ? picked : null,
    project_id: projectId,
    persist: f.persist,
  };

  if (generate) {
    body.effort = f.effort;
    if (f.mode) body.mode = f.mode;
    body.response_mode = f.responseMode;
    body.enable_general_knowledge = f.generalKnowledge;
    body.use_profile = f.useProfile;
    if (f.citationCheck) body.enable_citation_check = f.citationCheck === 'on';
    if (task === 'outline') {
      const sections = f.sections.split(/[\n,;]/).map((s) => s.trim()).filter(Boolean).slice(0, 12);
      if (sections.length) body.sections = sections;
      if (f.paperType.trim()) body.paper_type = f.paperType.trim();
    } else if (task === 'questions') {
      if (f.audience.trim()) body.audience = f.audience.trim();
    } else {
      body.num_aims = intOrUndefined(f.numAims, 1, 5) ?? 3;
      if (f.mechanism.trim()) body.mechanism = f.mechanism.trim();
    }
    return body;
  }

  body.include_references = f.includeReferences;
  const min = year(f.yearMin);
  const max = year(f.yearMax);
  if (min !== undefined) body.year_min = min;
  if (max !== undefined) body.year_max = max;
  if (task === 'intro_citations') {
    if (f.style) body.style = f.style;
    body.input_kind = f.inputKind;
    const refs = intOrUndefined(f.refsPerPosition, 1, 10);
    if (refs !== undefined) body.refs_per_position = refs;
    const positions = intOrUndefined(f.maxPositions, 1, 100);
    if (positions !== undefined) body.max_positions = positions;
    body.cite_all = f.citeAll;
  } else {
    const journals = intOrUndefined(f.maxJournals, 1, 25);
    if (journals !== undefined) body.max_journals = journals;
  }
  return body;
}
