using System.Security.Claims;

namespace DudaErp.Api.Services;

public static class AccessRules
{
    public const string Admin = "Administrador";
    public const string Billing = "Faturamento";
    public const string Finance = "Financeiro";
    public const string Buyer = "Comprador";
    public const string Dispatch = "Expedição";
    public const string Production = "Produção";
    public const string PermissionClaim = "forty_permission";
    public static readonly string[] Roles = [Admin, Billing, Finance, Buyer, Dispatch, Production];

    public sealed record Action(string Key, string Label, string[] Roles);
    public sealed record Module(string Group, string Name, Action[] Actions);

    private static Module Standard(string group, string name, string key, string[] readers, string[] writers) =>
        new(group, name, [
            new(key + ".read", "Consultar", readers),
            new(key + ".create", "Criar", writers),
            new(key + ".edit", "Editar", writers),
            new(key + ".delete", "Excluir", writers)
        ]);

    public static readonly Module[] Modules =
    [
        Standard("Cadastros", "Clientes", "customers", [Billing, Finance], [Billing]),
        Standard("Cadastros", "Produtos", "products", [Billing, Finance, Dispatch, Production], []),
        Standard("Cadastros", "Vendedores", "sellers", [Billing, Finance, Dispatch], []),
        Standard("Cadastros", "Regiões", "regions", [Billing, Finance, Dispatch], []),
        Standard("Cadastros", "Veículos", "vehicles", [Billing, Finance, Dispatch], []),
        new("Cadastros", "Importação de planilhas", [
            new("imports.customers", "Importar clientes", [Billing]),
            new("imports.products", "Importar produtos", [])
        ]),
        new("Comercial", "Pedidos e vendas", [
            new("orders.commercial", "Consultar", [Billing, Finance]),
            new("orders.create", "Criar", [Billing]),
            new("orders.edit", "Editar", [Billing]),
            new("orders.delete", "Excluir", [Billing]),
            new("orders.approve", "Aprovar para produção", [Finance]),
            new("orders.bill", "Faturar", [Billing])
        ]),
        new("Operação", "Cargas e entregas", [
            .. Standard("Operação", "Cargas e entregas", "loads", [Dispatch], [Dispatch]).Actions,
            new("loads.dispatch", "Registrar saída", [Dispatch]),
            new("loads.return", "Registrar retorno", [Dispatch]),
            new("loads.reconcile", "Conferir entrega", [Dispatch])
        ]),
        new("Operação", "Pedidos para expedição", [new("orders.read", "Consultar", [Dispatch])]),
        new("Operação", "Estoque", [
            new("stock.read", "Consultar", [Billing, Finance, Dispatch, Production]),
            new("stock.manage", "Movimentar estoque", [])
        ]),
        new("Operação", "Produção", [
            new("production.read", "Consultar", [Production]),
            new("production.create", "Criar", [Production]),
            new("production.complete", "Concluir", [Production]),
            new("production.cancel", "Cancelar programação", [Production])
        ]),
        new("Financeiro", "Contas a pagar", [
            .. Standard("Financeiro", "Contas a pagar", "payables", [Finance, Buyer], [Finance]).Actions,
            new("payables.pay", "Registrar pagamento", [Finance]),
            new("payables.check", "Conferir pagamento", [Finance])
        ]),
        new("Financeiro", "Contas a receber", [
            new("receivables.read", "Consultar", [Finance]),
            new("receivables.create", "Criar", [Billing, Finance]),
            new("receivables.edit", "Editar", [Finance]),
            new("receivables.delete", "Excluir", [Finance]),
            new("receivables.receive", "Registrar recebimento", [Finance])
        ]),
        new("Financeiro", "Resumo por cliente", [new("finance.customer", "Consultar", [Finance])])
    ];

    public static readonly IReadOnlyDictionary<string, string[]> Permissions = Modules.SelectMany(module => module.Actions)
        .ToDictionary(action => action.Key, action => action.Roles.Prepend(Admin).ToArray());

    public static string[] ForRole(string? role) =>
        EffectiveGrants(Permissions.Where(x => x.Value.Contains(role)).Select(x => x.Key)
            .Concat(role == Admin ? ["users.manage"] : Array.Empty<string>()));

    public static IEnumerable<string> PolicyNames => Permissions.Keys.Concat(["users.manage", "orders.lookup"]);

    public static bool IsCustomPermission(string? key) => key is not null && Permissions.ContainsKey(key);

    public static bool ValidCombination(string[] permissions) =>
        Modules.All(module =>
        {
            var read = module.Actions.FirstOrDefault(action => action.Label == "Consultar");
            return read is null || permissions.Contains(read.Key) ||
                !module.Actions.Any(action => action.Key != "receivables.create" && permissions.Contains(action.Key));
        });

    public static string[] Effective(string role, string[]? custom) =>
        role == Admin || custom is null ? ForRole(role) : EffectiveGrants(custom.Where(IsCustomPermission));

    private static string[] EffectiveGrants(IEnumerable<string> permissions)
    {
        var grants = permissions.ToHashSet(StringComparer.Ordinal);
        if (grants.Contains("orders.commercial") || grants.Contains("orders.read")) grants.Add("orders.lookup");
        return grants.Order(StringComparer.Ordinal).ToArray();
    }

    public static bool Has(ClaimsPrincipal user, string permission) => user.HasClaim(PermissionClaim, permission);
}
