import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Cpu } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { InfoTooltip } from './Tooltip';
import { api } from '../services/api';
import { answeringModel, findAnswerModel } from '../lib/answerModels';
import type { AnswerModelsResponse } from '../types';

// The list is the server's and changes only when it is redeployed, so one
// fetch serves every mount. A failure is not kept: the next mount tries again.
let modelsPromise: Promise<AnswerModelsResponse> | null = null;
function loadAnswerModels(): Promise<AnswerModelsResponse> {
  if (!modelsPromise) {
    modelsPromise = api.getAnswerModels().catch((error) => {
      modelsPromise = null;
      throw error;
    });
  }
  return modelsPromise;
}

const CAUTION_CLASS =
  'flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400';

export function ModelPicker() {
  const { state, dispatch } = useApp();
  const chosen = state.queryOptions.answerModel;
  const [list, setList] = useState<AnswerModelsResponse | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadAnswerModels()
      .then((data) => {
        if (!cancelled) setList(data);
      })
      .catch(() => {
        // No list, no picker: the question still goes out on the server's model.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // A stored choice can name a model the server has since dropped. Sending it
  // would fail every question, so it falls back to "not chosen".
  useEffect(() => {
    if (list && chosen && !findAnswerModel(list, chosen)) {
      dispatch({ type: 'SET_QUERY_OPTIONS', payload: { answerModel: null } });
    }
  }, [list, chosen, dispatch]);

  if (!list) return null;

  const current = answeringModel(list, chosen);
  const defaultModel = list.models.find((m) => m.is_default) ?? null;
  const defaultLabel = defaultModel?.label ?? list.configured_model;

  const select = (name: string | null) => {
    dispatch({ type: 'SET_QUERY_OPTIONS', payload: { answerModel: name } });
  };

  const optionClass = (selected: boolean) =>
    `w-full text-left px-3 py-2 rounded-lg border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
      selected
        ? 'bg-blue-600 border-blue-600 text-white'
        : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-blue-400'
    }`;

  return (
    <div className="w-full">
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex items-center gap-1.5 text-sm rounded-md px-1.5 py-0.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <Cpu className="w-4 h-4" aria-hidden="true" />
          Model: {chosen ? current?.label : `${defaultLabel} (default)`}
          {open ? (
            <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
          )}
        </button>
        <InfoTooltip content="Which model writes the answer. Your choice is kept for every conversation. Default leaves it to the server, which also decides what happens if that model cannot answer." />
      </span>

      {/* Closed, the caution still shows for the model that will answer: it is
          the point of the picker, and a hover is too easy to miss. */}
      {!open && current?.caution && (
        <p role="note" className={`mt-1.5 ml-1.5 ${CAUTION_CLASS}`}>
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
          <span>{current.caution}</span>
        </p>
      )}

      {open && (
        <div
          role="radiogroup"
          aria-label="Answer model"
          className="mt-2 space-y-2 animate-fade-in"
        >
          <button
            type="button"
            role="radio"
            aria-checked={!chosen}
            onClick={() => select(null)}
            className={optionClass(!chosen)}
          >
            <span className="text-sm font-medium">Server default</span>
            <span className={`block text-xs ${!chosen ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'}`}>
              Currently {defaultLabel}, with whatever fallback the server is set up with.
            </span>
          </button>
          {list.models.map((m) => {
            const selected = chosen === m.name;
            return (
              <div key={m.name}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => select(m.name)}
                  title={m.caution ?? m.blurb}
                  className={optionClass(selected)}
                >
                  <span className="text-sm font-medium">{m.label}</span>
                  <span className={`block text-xs ${selected ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'}`}>
                    {m.blurb}
                  </span>
                </button>
                {/* Under the option, not inside it: on the selected row's blue
                    the amber would not read, and it must be visible before the
                    click that chooses it. */}
                {m.caution && (
                  <p role="note" className={`mt-1 mx-1 ${CAUTION_CLASS}`}>
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                    <span>{m.caution}</span>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
