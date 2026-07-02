import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from "@mui/material";

function EventTable({ events }) {
  return (
    <TableContainer
      component={Paper}
      sx={{
        bgcolor: "background.paper",
        overflowX: "auto",
        borderRadius: 2,
      }}
    >
      <Table sx={{ minWidth: 700 }}>
        <TableHead>
          <TableRow>
            <TableCell><strong>Event Type</strong></TableCell>
            <TableCell><strong>Sensor Node</strong></TableCell>
            <TableCell><strong>Confidence</strong></TableCell>
            <TableCell><strong>Timestamp</strong></TableCell>
          </TableRow>
        </TableHead>

        <TableBody>
          {events.map((event, index) => (
            <TableRow key={index}>
              <TableCell>{event.event}</TableCell>
              <TableCell>{event.node}</TableCell>
              <TableCell>{event.confidence}</TableCell>
              <TableCell>{event.timestamp}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default EventTable;