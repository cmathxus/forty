using System.Security.Claims;

namespace DudaErp.Api.Services;

public static class AccessRules
{
    public const string Admin = "Administrador";
    public const string Billing = "Faturamento";
    public const string Dispatch = "Expedição";
    public const string Production = "Produção";
    public static readonly string[] Roles = [Admin, Billing, Dispatch, Production];

    public static readonly IReadOnlyDictionary<string, string[]> Permissions = new Dictionary<string, string[]>
    {
        ["users.manage"] = [Admin],
        ["catalog.read"] = Roles,
        ["catalog.references"] = [Admin, Billing, Dispatch],
        ["catalog.manage"] = [Admin],
        ["customers.manage"] = [Admin, Billing],
        ["orders.read"] = [Admin, Billing, Dispatch],
        ["orders.manage"] = [Admin, Billing],
        ["loads.manage"] = [Admin, Dispatch],
        ["finance.manage"] = [Admin, Billing],
        ["stock.read"] = Roles,
        ["stock.manage"] = [Admin],
        ["production.manage"] = [Admin, Production]
    };

    public static string[] ForRole(string? role) => Permissions.Where(x => x.Value.Contains(role)).Select(x => x.Key).ToArray();
    public static bool Has(ClaimsPrincipal user, string permission) => Permissions.TryGetValue(permission, out var roles) && roles.Any(user.IsInRole);
}
