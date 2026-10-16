"""API request/response contracts aligned to IBM Telco dataset categories."""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ChurnRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", json_schema_extra={
        "examples": [{
            "tenure": 24, "monthly_charges": 79.5, "senior_citizen": 0,
            "contract": "Month-to-month", "internet_service": "Fiber optic",
            "payment_method": "Electronic check", "tech_support": "No",
            "online_security": "No", "paperless_billing": "Yes",
        }]
    })
    tenure: int = Field(ge=0, le=120, strict=True, description="Months with provider")
    monthly_charges: float = Field(ge=0, le=250, allow_inf_nan=False, description="Monthly bill (dataset USD)")
    senior_citizen: Literal[0, 1]
    contract: Literal["Month-to-month", "One year", "Two year"]
    internet_service: Literal["DSL", "Fiber optic", "No"]
    payment_method: Literal[
        "Bank transfer (automatic)", "Credit card (automatic)",
        "Electronic check", "Mailed check",
    ]
    tech_support: Literal["No", "No internet service", "Yes"]
    online_security: Literal["No", "No internet service", "Yes"]
    paperless_billing: Literal["No", "Yes"]

    @model_validator(mode="after")
    def check_internet_services(self):
        no_internet = self.internet_service == "No"
        for value in (self.tech_support, self.online_security):
            if (value == "No internet service") != no_internet:
                raise ValueError("tech_support and online_security must match internet_service")
        return self


class ChurnResponse(BaseModel):
    prediction: Literal[0, 1]
    probability: float = Field(ge=0, le=1)
    message: str
    model_version: str


class BatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    customers: list[ChurnRequest] = Field(min_length=1, max_length=500)


class BatchResponse(BaseModel):
    total: int
    high_risk: int
    low_risk: int
    model_version: str
    results: list[ChurnResponse]
