import { Card, CardContent, Typography, Box } from "@mui/material";

function StatCard({ title, value }) {
  return (
    <Card
      sx={{
        width: "100%",
        height: 150,
        bgcolor: "background.paper",
        borderRadius: 3,
        boxShadow: 4,
        transition: "0.3s",
        "&:hover": {
          transform: "translateY(-4px)",
          boxShadow: 8,
        },
      }}
    >
      <CardContent>
        <Typography
          variant="body2"
          color="text.secondary"
          gutterBottom
        >
          {title}
        </Typography>

        <Box sx={{ mt: 2 }}>
          <Typography
            variant="h4"
            fontWeight="bold"
          >
            {value}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}

export default StatCard;