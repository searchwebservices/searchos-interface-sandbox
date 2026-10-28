import type { Sale } from "../types";
import { SalesEdit } from "./SalesEdit";
import { SalesList } from "./SalesList";

export default {
  list: SalesList,
  edit: SalesEdit,
  recordRepresentation: (record: Sale) =>
    `${record.first_name} ${record.last_name}`,
};
