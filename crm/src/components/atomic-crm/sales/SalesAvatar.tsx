import type { Identifier } from "ra-core";
import { useGetManyAggregate } from "ra-core";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// The person who did the thing (initials), for activity rows. Never the company.
export const SalesAvatar = ({ id }: { id?: Identifier }) => {
  const { data } = useGetManyAggregate(
    "sales",
    { ids: id != null ? [id] : [] },
    { enabled: id != null },
  );
  const sale = data?.[0];
  const initials = sale
    ? `${sale.first_name?.charAt(0) ?? ""}${sale.last_name?.charAt(0) ?? ""}`.toUpperCase()
    : "";
  return (
    <Avatar
      className="w-[20px] h-[20px] shrink-0"
      title={sale ? `${sale.first_name} ${sale.last_name}` : undefined}
    >
      <AvatarImage src={sale?.avatar?.src ?? undefined} />
      <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
    </Avatar>
  );
};
