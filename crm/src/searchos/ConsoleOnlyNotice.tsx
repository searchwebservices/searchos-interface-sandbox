export const SESSION_MESSAGE = "Open this from the SearchOS console";
export const SESSION_ERROR_MESSAGE =
  "The session service did not answer. Reload from the SearchOS console";

export const ConsoleOnlyNotice = ({
  message = SESSION_MESSAGE,
}: {
  message?: string;
}) => (
  <div className="flex min-h-screen items-center justify-center bg-background p-6">
    <p className="text-sm text-muted-foreground">{message}</p>
  </div>
);
