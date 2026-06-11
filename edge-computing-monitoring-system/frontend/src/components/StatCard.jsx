function StatCard({ title, value }) {
  return (
    <div
      style={{
        border: "1px solid #ccc",
        padding: "20px",
        borderRadius: "10px",
        minWidth: "180px",
      }}
    >
      <h3>{title}</h3>
      <p style={{ fontSize: "24px", fontWeight: "bold" }}>{value}</p>
    </div>
  );
}

export default StatCard;