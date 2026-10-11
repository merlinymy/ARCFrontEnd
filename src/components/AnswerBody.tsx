import { memo, useMemo, type HTMLAttributes } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AnswerContext, useAnswerContext, type AnswerContextValue } from './answerContext';
import { CitationChip, LegacySourceChip } from './CitationChip';
import type { Citation, Claim, EntailmentReport, Source } from '../types';
import {
  TAGGED_MARKER_RE,
  claimIndexForMarker,
  indexEntailment,
  labelForPair,
  parseMarkerIds,
  tagMarkers,
} from '../lib/citations';

// ---------------------------------------------------------------------------
// remark plugins: turn marker text into elements the `span` override renders
// ---------------------------------------------------------------------------

// The slice of an mdast node these plugins use. (Declared here rather than
// imported from `mdast`, which is only a transitive dependency.)
interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  data?: { hName?: string; hProperties?: Record<string, unknown> };
}

function markerNode(properties: Record<string, string>): MdNode {
  // No `value` and no children: mdast-util-to-hast makes an element from `hName`.
  return { type: 'citationMarker', data: { hName: 'span', hProperties: properties } };
}

/**
 * Replace every `⟦1,3:k⟧` (see `tagMarkers`) in the text nodes of the tree with
 * a `<span data-cite-ids data-cite-k>`. It walks the parsed tree, so a marker
 * inside a table cell, a list item, bold or a heading is found as surely as one
 * in a paragraph, and nothing in the markdown syntax can swallow it.
 */
function remarkW3Markers() {
  return (tree: MdNode) => {
    const walk = (node: MdNode) => {
      if (!node.children) return;
      const out: MdNode[] = [];
      for (const child of node.children) {
        if (child.type === 'text' && child.value && child.value.includes('⟦')) {
          const text = child.value;
          const re = new RegExp(TAGGED_MARKER_RE.source, 'g');
          let last = 0;
          let m: RegExpExecArray | null;
          while ((m = re.exec(text)) !== null) {
            if (m.index > last) out.push({ type: 'text', value: text.slice(last, m.index) });
            out.push(markerNode({ dataCiteIds: m[1], dataCiteK: m[2] }));
            last = m.index + m[0].length;
          }
          if (last < text.length) out.push({ type: 'text', value: text.slice(last) });
        } else {
          walk(child);
          out.push(child);
        }
      }
      node.children = out;
    };
    walk(tree);
  };
}

// Pre-W3 text: [Source 8], [Source 8, Source 9], and the bare [8] forms the old renderer accepted.
const LEGACY_RE = /\[((?:Source\s*)?\d+(?:\s*,\s*(?:Source\s*)?\d+)*)\]/gi;

function remarkLegacyMarkers() {
  return (tree: MdNode) => {
    const walk = (node: MdNode) => {
      if (!node.children) return;
      const out: MdNode[] = [];
      for (const child of node.children) {
        if (child.type === 'text' && child.value && child.value.includes('[')) {
          const text = child.value;
          const re = new RegExp(LEGACY_RE.source, 'gi');
          let last = 0;
          let m: RegExpExecArray | null;
          while ((m = re.exec(text)) !== null) {
            if (m.index > last) out.push({ type: 'text', value: text.slice(last, m.index) });
            const ids = (m[1].match(/\d+/g) ?? []).join(',');
            out.push(markerNode({ dataLegacyIds: ids }));
            last = m.index + m[0].length;
          }
          if (last < text.length) out.push({ type: 'text', value: text.slice(last) });
        } else {
          walk(child);
          out.push(child);
        }
      }
      node.children = out;
    };
    walk(tree);
  };
}

// ---------------------------------------------------------------------------
// Renderers for the marker spans
// ---------------------------------------------------------------------------

function W3Marker({ ids, k }: { ids: string; k: number }) {
  const { citations, claims, entailment } = useAnswerContext();
  const idList = parseMarkerIds(ids);
  const claimIndex = claimIndexForMarker(claims, k, idList);
  return (
    <>
      {idList.map((id) => (
        <CitationChip
          key={id}
          id={id}
          citation={citations.get(id)}
          label={labelForPair(entailment, claimIndex, id)}
        />
      ))}
    </>
  );
}

type SpanProps = HTMLAttributes<HTMLSpanElement> & {
  node?: unknown;
  'data-cite-ids'?: string;
  'data-cite-k'?: string;
  'data-legacy-ids'?: string;
};

// A stable component map: the answer changes on every streamed chunk, and a
// new `components` object each time would remount every chip.
function Span(props: SpanProps) {
  const citeIds = props['data-cite-ids'];
  if (citeIds) {
    return <W3Marker ids={citeIds} k={Number(props['data-cite-k'] ?? -1)} />;
  }
  const legacyIds = props['data-legacy-ids'];
  if (legacyIds) {
    return (
      <>
        {parseMarkerIds(legacyIds).map((n) => (
          <LegacySourceChip key={n} n={n} />
        ))}
      </>
    );
  }
  // react-markdown passes the hast `node`; it must not reach the DOM.
  const rest = { ...props };
  delete rest.node;
  return <span {...rest} />;
}

const COMPONENTS = { span: Span };
const W3_PLUGINS = [remarkGfm, remarkW3Markers];
const LEGACY_PLUGINS = [remarkGfm, remarkLegacyMarkers];

// ---------------------------------------------------------------------------
// The answer
// ---------------------------------------------------------------------------

interface AnswerBodyProps {
  content: string;
  /** Present (even if empty) for a W3 answer; undefined for a stored pre-W3 one. */
  citations: Citation[] | undefined;
  claims?: Claim[];
  entailment?: EntailmentReport | null;
  entailmentPending?: boolean;
  /** Pre-W3 only: `[Source N]` indexes this list. */
  legacySources?: Source[];
}

/**
 * The markdown of one answer, with its citation markers drawn as chips.
 *
 * The same component renders a half-streamed answer and the finished one: the
 * chips find their citations by id in context, and the server guarantees a
 * citation arrives before the marker that points at it.
 */
export const AnswerBody = memo(function AnswerBody({
  content,
  citations,
  claims,
  entailment,
  entailmentPending = false,
  legacySources,
}: AnswerBodyProps) {
  const isW3 = citations !== undefined;

  const ctx = useMemo<AnswerContextValue>(
    () => ({
      citations: new Map((citations ?? []).map((c) => [c.id, c])),
      claims: claims ?? [],
      entailment: indexEntailment(entailment),
      entailmentPending,
      legacySources: legacySources ?? [],
    }),
    [citations, claims, entailment, entailmentPending, legacySources]
  );

  const markdown = useMemo(() => (isW3 ? tagMarkers(content) : content), [isW3, content]);

  return (
    <AnswerContext.Provider value={ctx}>
      <div className="markdown-content">
        <ReactMarkdown
          remarkPlugins={isW3 ? W3_PLUGINS : LEGACY_PLUGINS}
          components={COMPONENTS}
        >
          {markdown}
        </ReactMarkdown>
      </div>
    </AnswerContext.Provider>
  );
});
