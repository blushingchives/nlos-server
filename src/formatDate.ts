export function formatDate(date: Date) {
  const sgDate = new Date(date.toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
  const year = sgDate.getFullYear();
  const month = (sgDate.getMonth() + 1).toString().padStart(2, "0");
  const day = sgDate.getDate().toString().padStart(2, "0");
  const hours = sgDate.getHours().toString().padStart(2, "0");
  const minutes = sgDate.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}, ${day}-${month}-${year}`;
}
