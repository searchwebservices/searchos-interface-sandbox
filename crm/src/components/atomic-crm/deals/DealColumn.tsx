import { formatMoney } from "@/searchos/money";
import { Droppable } from "@hello-pangea/dnd";

import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Deal } from "../types";
import { findDealLabel } from "./dealUtils";
import { DealCard } from "./DealCard";

export const DealColumn = ({
  stage,
  deals,
}: {
  stage: string;
  deals: Deal[];
}) => {
  const totalAmount = deals.reduce((sum, deal) => sum + deal.amount, 0);
  const { dealStages, currency } = useConfigurationContext();
  return (
    <div className="w-64 shrink-0 pb-8">
      <div className="sos-col-head">
        <h3 className="si-label">{findDealLabel(dealStages, stage)}</h3>
        <p className="sos-col-total">{formatMoney(totalAmount, currency)}</p>
      </div>
      <Droppable droppableId={stage}>
        {(droppableProvided, snapshot) => (
          <div
            ref={droppableProvided.innerRef}
            {...droppableProvided.droppableProps}
            className={`sos-col-drop flex flex-col mt-2 gap-2 p-1 min-h-16 ${
              snapshot.isDraggingOver ? "is-over" : ""
            }`}
          >
            {deals.map((deal, index) => (
              <DealCard key={deal.id} deal={deal} index={index} />
            ))}
            {droppableProvided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
};
