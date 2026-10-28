export const RoundButton = ({ color, handleClick, selected }: any) => (
  <button
    type="button"
    className={`w-8 h-8 rounded-full inline-block m-1 transition-all ${
      selected ? "ring-2 ring-ring ring-offset-1" : ""
    }`}
    style={{ backgroundColor: color }}
    onClick={handleClick}
  />
);
