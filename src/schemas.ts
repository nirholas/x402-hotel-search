/**
 * Per-route request/response contracts published inside the x402 402 challenge.
 *
 * GENERATED FROM `public/openapi.json` — do not hand-edit. Run `npm run schemas`
 * after changing the OpenAPI document so the runtime challenge and the published
 * metadata cannot drift apart.
 *
 * The x402scan discovery spec requires every `accepts[]` entry to carry
 * `outputSchema.input` and `outputSchema.output`. Together they are how an agent
 * calls a route it has never seen before: `input` describes the request in the
 * x402 Bazaar `type: "http"` shape, and `output` is the JSON Schema of the 200
 * body the agent receives once it has paid. All `$ref`s are inlined, since a
 * client reading the challenge has not fetched the OpenAPI document.
 *
 * Keys match the paywall route map exactly:
 *   GET /search
 *   GET /offer/:offerId
 */

/**
 * One paid route's published request/response contract.
 *
 * Declared as a type alias rather than an interface so that it keeps an
 * implicit index signature and stays assignable to the paywall's
 * `outputSchema?: Record<string, unknown>`.
 */
export type RouteSchema = {
  /** How to call the route: method, path/query parameters or JSON body fields. */
  input: Record<string, unknown>;
  /** JSON Schema of the 200 response body. */
  output: Record<string, unknown>;
};

export const ROUTE_SCHEMAS: Record<string, RouteSchema> = {
  "GET /search": {
    "input": {
      "type": "http",
      "method": "GET",
      "queryParams": {
        "cityCode": {
          "type": "string",
          "pattern": "^[A-Z]{3}$",
          "description": "Required. 3-letter IATA city code"
        },
        "checkInDate": {
          "type": "string",
          "format": "date",
          "description": "Required."
        },
        "checkOutDate": {
          "type": "string",
          "format": "date",
          "description": "Required."
        },
        "adults": {
          "type": "integer",
          "minimum": 1,
          "maximum": 9,
          "default": 1
        },
        "rooms": {
          "type": "integer",
          "minimum": 1,
          "maximum": 5,
          "default": 1
        },
        "max": {
          "type": "integer",
          "minimum": 1,
          "maximum": 20,
          "default": 5
        }
      }
    },
    "output": {
      "type": "object",
      "properties": {
        "source": {
          "enum": [
            "amadeus",
            "fixture"
          ],
          "description": "Whether this came from live Amadeus or deterministic fixtures"
        },
        "query": {
          "type": "object"
        },
        "nights": {
          "type": "integer"
        },
        "currency": {
          "type": "string"
        },
        "offers": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "offerId": {
                "type": "string",
                "description": "Pass to GET /offer/:offerId"
              },
              "source": {
                "enum": [
                  "amadeus",
                  "fixture"
                ]
              },
              "hotel": {
                "type": "object",
                "properties": {
                  "hotelId": {
                    "type": "string"
                  },
                  "name": {
                    "type": "string"
                  },
                  "rating": {
                    "type": "number",
                    "description": "Star rating, 0 when unknown"
                  },
                  "address": {
                    "type": "object",
                    "properties": {
                      "cityCode": {
                        "type": "string"
                      },
                      "cityName": {
                        "type": "string"
                      },
                      "countryCode": {
                        "type": "string"
                      },
                      "line": {
                        "type": "string"
                      }
                    }
                  },
                  "geo": {
                    "type": "object",
                    "properties": {
                      "latitude": {
                        "type": "number"
                      },
                      "longitude": {
                        "type": "number"
                      }
                    }
                  },
                  "amenities": {
                    "type": "array",
                    "items": {
                      "type": "string"
                    },
                    "description": "Amadeus amenity codes, e.g. WIFI, PARKING, SWIMMING_POOL"
                  }
                }
              },
              "checkInDate": {
                "type": "string",
                "format": "date"
              },
              "checkOutDate": {
                "type": "string",
                "format": "date"
              },
              "nights": {
                "type": "integer"
              },
              "adults": {
                "type": "integer"
              },
              "room": {
                "type": "object",
                "properties": {
                  "type": {
                    "type": "string"
                  },
                  "beds": {
                    "type": "integer"
                  },
                  "bedType": {
                    "type": "string"
                  },
                  "description": {
                    "type": "string"
                  }
                }
              },
              "boardType": {
                "type": "string",
                "description": "ROOM_ONLY | BREAKFAST | HALF_BOARD"
              },
              "price": {
                "type": "object",
                "properties": {
                  "total": {
                    "type": "string"
                  },
                  "perNight": {
                    "type": "string"
                  },
                  "currency": {
                    "type": "string"
                  }
                }
              },
              "cancellation": {
                "type": "object",
                "properties": {
                  "refundable": {
                    "type": "boolean"
                  },
                  "deadline": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "format": "date-time"
                  },
                  "policy": {
                    "type": "string"
                  }
                }
              },
              "available": {
                "type": "boolean"
              }
            },
            "required": [
              "offerId",
              "hotel",
              "price",
              "cancellation"
            ]
          }
        },
        "retrievedAt": {
          "type": "string",
          "format": "date-time"
        }
      },
      "required": [
        "source",
        "offers",
        "retrievedAt"
      ]
    }
  },
  "GET /offer/:offerId": {
    "input": {
      "type": "http",
      "method": "GET",
      "pathParams": {
        "offerId": {
          "type": "string"
        }
      },
      "queryParams": {}
    },
    "output": {
      "type": "object",
      "properties": {
        "source": {
          "enum": [
            "amadeus",
            "fixture"
          ]
        },
        "offerId": {
          "type": "string"
        },
        "confirmed": {
          "type": "boolean"
        },
        "offer": {
          "type": "object",
          "properties": {
            "offerId": {
              "type": "string",
              "description": "Pass to GET /offer/:offerId"
            },
            "source": {
              "enum": [
                "amadeus",
                "fixture"
              ]
            },
            "hotel": {
              "type": "object",
              "properties": {
                "hotelId": {
                  "type": "string"
                },
                "name": {
                  "type": "string"
                },
                "rating": {
                  "type": "number",
                  "description": "Star rating, 0 when unknown"
                },
                "address": {
                  "type": "object",
                  "properties": {
                    "cityCode": {
                      "type": "string"
                    },
                    "cityName": {
                      "type": "string"
                    },
                    "countryCode": {
                      "type": "string"
                    },
                    "line": {
                      "type": "string"
                    }
                  }
                },
                "geo": {
                  "type": "object",
                  "properties": {
                    "latitude": {
                      "type": "number"
                    },
                    "longitude": {
                      "type": "number"
                    }
                  }
                },
                "amenities": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  },
                  "description": "Amadeus amenity codes, e.g. WIFI, PARKING, SWIMMING_POOL"
                }
              }
            },
            "checkInDate": {
              "type": "string",
              "format": "date"
            },
            "checkOutDate": {
              "type": "string",
              "format": "date"
            },
            "nights": {
              "type": "integer"
            },
            "adults": {
              "type": "integer"
            },
            "room": {
              "type": "object",
              "properties": {
                "type": {
                  "type": "string"
                },
                "beds": {
                  "type": "integer"
                },
                "bedType": {
                  "type": "string"
                },
                "description": {
                  "type": "string"
                }
              }
            },
            "boardType": {
              "type": "string",
              "description": "ROOM_ONLY | BREAKFAST | HALF_BOARD"
            },
            "price": {
              "type": "object",
              "properties": {
                "total": {
                  "type": "string"
                },
                "perNight": {
                  "type": "string"
                },
                "currency": {
                  "type": "string"
                }
              }
            },
            "cancellation": {
              "type": "object",
              "properties": {
                "refundable": {
                  "type": "boolean"
                },
                "deadline": {
                  "type": [
                    "string",
                    "null"
                  ],
                  "format": "date-time"
                },
                "policy": {
                  "type": "string"
                }
              }
            },
            "available": {
              "type": "boolean"
            }
          },
          "required": [
            "offerId",
            "hotel",
            "price",
            "cancellation"
          ]
        },
        "priceBreakdown": {
          "type": "object",
          "properties": {
            "nights": {
              "type": "integer"
            },
            "perNight": {
              "type": "string"
            },
            "total": {
              "type": "string"
            },
            "currency": {
              "type": "string"
            },
            "note": {
              "type": "string"
            }
          }
        },
        "priceGuarantee": {
          "type": "string"
        },
        "pricedAt": {
          "type": "string",
          "format": "date-time"
        }
      },
      "required": [
        "offerId",
        "confirmed",
        "offer",
        "priceBreakdown"
      ]
    }
  }
};
