function EventTable({ events }) {
  return (
    <table border="1" cellPadding="10">
      <thead>
        <tr>
          <th>Event Type</th>
          <th>Sensor Node</th>
          <th>Confidence</th>
          <th>Timestamp</th>
        </tr>
      </thead>

      <tbody>
        {events.map((event) => (
          <tr key={event.id}>
            <td>{event.type}</td>
            <td>{event.node}</td>
            <td>{event.confidence}</td>
            <td>{event.timestamp}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default EventTable;