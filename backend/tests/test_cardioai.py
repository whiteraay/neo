import json
import numpy as np
import pytest
from services.cardioai import ROOT, predict


def test_converted_model_matches_original_sklearn_predictions():
    for case in json.loads((ROOT / "reference_predictions.json").read_text()):
        actual = predict(case["features"])
        expected = case["prediction"]
        assert actual["stage"] == expected["stage"]
        np.testing.assert_allclose([x["share"] for x in actual["class_shares"]], [x["share"] for x in expected["class_shares"]], atol=1e-12)
        assert actual["numeric_supplied"] == 3
        assert actual["pregnancy_validated"] is False


def test_model_rejects_non_finite_values():
    with pytest.raises(ValueError):
        predict({"age": float("nan")})
