function minutesBetween(start, end) {
  return Math.round((end.getTime() - start.getTime()) / 60000);
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

function formatTimestamp(date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

module.exports = {
  minutesBetween,
  addMinutes,
  formatTimestamp,
};
