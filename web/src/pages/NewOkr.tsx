import { useNavigate } from "react-router-dom";
import NewOkrModal from "../components/NewOkrModal";

export default function NewOkr() {
  const navigate = useNavigate();
  return (
    <NewOkrModal
      onClose={() => navigate("/")}
      onCreated={(okrId) => navigate(`/okr/${okrId}`)}
    />
  );
}
