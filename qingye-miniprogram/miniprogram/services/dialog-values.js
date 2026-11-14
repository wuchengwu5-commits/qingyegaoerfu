const pad = n => String(n).padStart(2, '0');
function iso(year, month, day) { return year + '-' + pad(month + 1) + '-' + pad(day); }
function dateValue(value, start = '1970-01-01', end = '2100-12-31') {
  const today = new Date();
  let result = /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value : iso(today.getFullYear(), today.getMonth(), today.getDate());
  const [y, m, d] = result.split('-').map(Number), actual = new Date(y, m - 1, d);
  if (actual.getFullYear() !== y || actual.getMonth() !== m - 1 || actual.getDate() !== d) result = iso(today.getFullYear(), today.getMonth(), today.getDate());
  return result < start ? start : result > end ? end : result;
}
function calendar(value, start, end) {
  const [year, month] = value.split('-').map(Number), offset = new Date(year, month - 1, 1).getDay();
  const length = new Date(year, month, 0).getDate(), days = [];
  for (let i = 0; i < offset; i++) days.push({key:'blank'+i, label:'', value:'', disabled:true});
  for (let day = 1; day <= length; day++) {
    const date = iso(year, month - 1, day);
    days.push({key:date, label:day, value:date, disabled:!!(start && date < start || end && date > end)});
  }
  return {year, month, days};
}
function timeValue(value) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(value || '') ? value : '08:00'; }
module.exports = {pad, iso, dateValue, calendar, timeValue};
