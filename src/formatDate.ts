export function formatDate(date: Date) {
  const year = date.getFullYear();
  // Add 1 to month because getMonth() returns 0-indexed values
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}, ${day}-${month}-${year}`;
}
