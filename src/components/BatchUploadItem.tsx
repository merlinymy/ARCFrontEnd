import { FileText, X, RotateCcw, Check, Loader2, Circle } from 'lucide-react';
import type { UploadTask, UploadTaskStatus } from '../types';

interface BatchUploadItemProps {
  task: UploadTask;
  onCancel: (taskId: string) => void;
  onRetry: (taskId: string) => void;
}

const statusConfig: Record<UploadTaskStatus, {
  color: string;
  bgColor: string;
  progressColor: string;
  label: string;
}> = {
  pending: {
    color: 'text-gray-500',
    bgColor: 'bg-gray-100 dark:bg-gray-700',
    progressColor: 'bg-gray-300',
    label: 'Waiting...',
  },
  uploading: {
    color: 'text-blue-500',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    progressColor: 'bg-blue-500',
    label: 'Uploading...',
  },
  processing: {
    color: 'text-blue-500',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    progressColor: 'bg-blue-500',
    label: 'Processing...',
  },
  extracting: {
    color: 'text-cyan-500',
    bgColor: 'bg-cyan-50 dark:bg-cyan-900/20',
    progressColor: 'bg-cyan-500',
    label: 'Extracting text...',
  },
  chunking: {
    color: 'text-teal-500',
    bgColor: 'bg-teal-50 dark:bg-teal-900/20',
    progressColor: 'bg-teal-500',
    label: 'Creating chunks...',
  },
  embedding: {
    color: 'text-purple-500',
    bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    progressColor: 'bg-purple-500',
    label: 'Generating embeddings...',
  },
  indexing: {
    color: 'text-indigo-500',
    bgColor: 'bg-indigo-50 dark:bg-indigo-900/20',
    progressColor: 'bg-indigo-500',
    label: 'Indexing...',
  },
  complete: {
    color: 'text-green-500',
    bgColor: 'bg-green-50 dark:bg-green-900/20',
    progressColor: 'bg-green-500',
    label: 'Complete',
  },
  error: {
    color: 'text-red-500',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    progressColor: 'bg-red-500',
    label: 'Failed',
  },
};

// Pipeline steps in order
const PIPELINE_STEPS = [
  { key: 'uploading', label: 'Upload' },
  { key: 'extracting', label: 'Extract' },
  { key: 'chunking', label: 'Chunk' },
  { key: 'embedding', label: 'Embed' },
  { key: 'indexing', label: 'Index' },
  { key: 'complete', label: 'Done' },
] as const;

// Map statuses to their pipeline step index (-1 means before pipeline)
function getStepIndex(status: UploadTaskStatus): number {
  switch (status) {
    case 'pending': return -1;
    case 'uploading': return 0;
    case 'processing': return 0; // still in upload/processing phase
    case 'extracting': return 1;
    case 'chunking': return 2;
    case 'embedding': return 3;
    case 'indexing': return 4;
    case 'complete': return 5;
    case 'error': return -2;
    default: return -1;
  }
}

function StepIcon({ state }: { state: 'completed' | 'active' | 'pending' }) {
  if (state === 'completed') {
    return (
      <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
        <Check className="h-3 w-3 text-white" strokeWidth={3} />
      </div>
    );
  }
  if (state === 'active') {
    return (
      <div className="w-5 h-5 rounded-full border-2 border-blue-500 flex items-center justify-center flex-shrink-0">
        <Loader2 className="h-3 w-3 text-blue-500 animate-spin" />
      </div>
    );
  }
  return (
    <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
      <Circle className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600" />
    </div>
  );
}

export function BatchUploadItem({ task, onCancel, onRetry }: BatchUploadItemProps) {
  const config = statusConfig[task.status];
  const isProcessing = !['pending', 'complete', 'error'].includes(task.status);
  const canCancel = ['pending', 'uploading'].includes(task.status);
  const canRetry = task.status === 'error';
  const currentStepIdx = getStepIndex(task.status);
  const showPipeline = task.status !== 'pending' && task.status !== 'error';

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className={`rounded-lg p-3 ${config.bgColor} transition-colors`}>
      <div className="flex items-start gap-3">
        {/* File icon */}
        <div className={`flex-shrink-0 mt-0.5 ${config.color}`}>
          <FileText className="h-5 w-5" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Filename and size */}
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {task.filename}
            </p>
            <div className="flex items-center gap-2 flex-shrink-0">
              {task.fileSize > 0 && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {formatFileSize(task.fileSize)}
                </span>
              )}
              {/* Actions */}
              {canRetry && (
                <button
                  onClick={() => onRetry(task.taskId)}
                  className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                  title="Retry"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
              {canCancel && (
                <button
                  onClick={() => onCancel(task.taskId)}
                  className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                  title="Cancel"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Step pipeline */}
          {showPipeline && (
            <div className="mt-2 flex items-center gap-0.5">
              {PIPELINE_STEPS.map((step, idx) => {
                let state: 'completed' | 'active' | 'pending';
                if (task.status === 'complete') {
                  state = 'completed';
                } else if (idx < currentStepIdx) {
                  state = 'completed';
                } else if (idx === currentStepIdx) {
                  state = 'active';
                } else {
                  state = 'pending';
                }

                return (
                  <div key={step.key} className="flex items-center">
                    {/* Connector line (before each step except first) */}
                    {idx > 0 && (
                      <div className="w-3 h-0.5 mx-0.5">
                        <div
                          className={`h-full rounded-full transition-colors duration-300 ${
                            state === 'completed' || (idx <= currentStepIdx && task.status !== 'complete' && idx < currentStepIdx)
                              ? 'bg-green-400'
                              : state === 'active'
                                ? 'bg-blue-300 dark:bg-blue-600'
                                : 'bg-gray-200 dark:bg-gray-600'
                          }`}
                        />
                      </div>
                    )}
                    {/* Step */}
                    <div className="flex flex-col items-center" title={step.label}>
                      <StepIcon state={state} />
                      <span className={`text-[10px] mt-0.5 leading-none ${
                        state === 'completed'
                          ? 'text-green-600 dark:text-green-400'
                          : state === 'active'
                            ? 'text-blue-600 dark:text-blue-400 font-medium'
                            : 'text-gray-400 dark:text-gray-500'
                      }`}>
                        {step.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Progress bar + status text */}
          {task.status !== 'pending' && (
            <>
              <div className="mt-2 h-1.5 w-full bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                <div
                  className={`h-full ${config.progressColor} transition-all duration-300 ease-out`}
                  style={{ width: `${task.progressPercent}%` }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className={`text-xs ${config.color}`}>
                  {task.currentStep || config.label}
                </span>
                {isProcessing && task.progressPercent > 0 && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {task.progressPercent}%
                  </span>
                )}
              </div>
            </>
          )}

          {/* Pending state */}
          {task.status === 'pending' && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {config.label}
            </p>
          )}

          {/* Error message */}
          {task.status === 'error' && task.errorMessage && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400 truncate">
              {task.errorMessage}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
