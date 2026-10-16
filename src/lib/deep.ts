/** A short plain-language line for one deep-run tool call (develop / critique / draft). */
export function describeToolCall(name: string, input: Record<string, unknown>): string {
  const text = (key: string) => (typeof input[key] === 'string' ? (input[key] as string) : '');
  switch (name) {
    case 'search_library':
      return text('query') ? `Searched the library for “${text('query')}”` : 'Searched the library';
    case 'get_numeric_facts': {
      const what = [text('entity'), text('property')].filter(Boolean).join(' ');
      return what ? `Looked up numbers for ${what}` : 'Looked up extracted numbers';
    }
    case 'expand_chunk':
      return `Read the ${text('direction') || 'surrounding'} passage`;
    case 'list_candidate_citations':
      return text('topic') ? `Listed papers on “${text('topic')}”` : 'Listed candidate papers';
    case 'memory':
      return 'Read or wrote the project notebook';
    default:
      return `Used ${name}`;
  }
}
