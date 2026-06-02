window.groqKey = () => localStorage.getItem('groq_api_key') || '';

window.callGroq = async function(messages, opts = {}) {
  const key = window.groqKey();
  if (!key) throw new Error('No Groq API key — add one in Settings');
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify({
      model: opts.model || 'llama-3.3-70b-versatile',
      messages,
      max_tokens: opts.max_tokens || 1024,
      temperature: opts.temperature !== undefined ? opts.temperature : 0.7,
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'Groq error ' + res.status);
  return data?.choices?.[0]?.message?.content || '';
};
