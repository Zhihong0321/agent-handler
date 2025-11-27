
const mockApiResponse = {
  "status": "success",
  "accounts": {
    "zhihong0321@gmail": {
      "name": "Main",
      "status": "valid",
      "created_at": "2025-11-27T02:54:13.115053",
      "last_used": "2025-11-27T09:56:59.170155",
      "last_validated": "2025-11-27T02:54:17.742102"
    }
  }
};

function transform(apiResponse) {
    if (apiResponse && apiResponse.accounts && typeof apiResponse.accounts === 'object') {
        return Object.entries(apiResponse.accounts).map(([key, value]) => ({
            ...value,
            account_name: key
        }));
    }
    return [];
}

const transformed = transform(mockApiResponse);
console.log("Transformed:", JSON.stringify(transformed, null, 2));
console.log("Is Array?", Array.isArray(transformed));
