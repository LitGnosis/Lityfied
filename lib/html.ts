export function escapeHtml(value:unknown){
 const text=String(value??'');
 return text.replace(/[&<>\"']/g,ch=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'
 }[ch]||ch));
}
