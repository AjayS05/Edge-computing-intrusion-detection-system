import { Card, CardContent, Typography } from "@mui/material";

function SectionCard({ title, children }) {
  return (
    <Card
      sx={{
        bgcolor: "background.paper",
        borderRadius: 3,
        boxShadow: 4,
        height: "100%",
      }}
    >
      <CardContent>
        <Typography
          variant="h6"
          fontWeight="bold"
          color="text.primary"
          sx={{ mb: 2 }}
        >
          {title}
        </Typography>

        {children}
      </CardContent>
    </Card>
  );
}

export default SectionCard;