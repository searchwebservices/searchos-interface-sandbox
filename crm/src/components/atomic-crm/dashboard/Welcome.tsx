import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Welcome = () => (
  <Card>
    <CardHeader className="px-4">
      <CardTitle>SearchOS CRM</CardTitle>
    </CardHeader>
    <CardContent className="px-4">
      <p className="text-sm">
        Companies, contacts and deals, kept in your own Search workspace.
      </p>
    </CardContent>
  </Card>
);
