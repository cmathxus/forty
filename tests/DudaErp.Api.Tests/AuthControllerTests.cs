using System.Security.Claims;
using DudaErp.Api.Controllers;
using DudaErp.Api.Data;
using DudaErp.Api.Domain;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace DudaErp.Api.Tests;

public sealed class AuthControllerTests
{
    [Fact]
    public async Task PasswordChange_RejectsWrongPasswordAndInvalidatesExistingSessions()
    {
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var hasher = new PasswordHasher<AppUser>();
        var user = new AppUser { Email = "qa@example.invalid", Name = "QA", PasswordHash = "" };
        user.PasswordHash = hasher.HashPassword(user, "original-test-password");
        db.Users.Add(user);
        await db.SaveChangesAsync();
        var originalStamp = user.SecurityStamp;
        var controller = new AuthController(db, hasher)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User =
                new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, user.Id.ToString())], "Bearer")) } }
        };
        Assert.IsType<BadRequestObjectResult>(await controller.ChangePassword(
            new AuthController.PasswordRequest("wrong", "new-test-password"), default));
        Assert.Equal(originalStamp, user.SecurityStamp);
        Assert.IsType<NoContentResult>(await controller.ChangePassword(
            new AuthController.PasswordRequest("original-test-password", "new-test-password"), default));
        Assert.NotEqual(originalStamp, user.SecurityStamp);
        Assert.Equal(PasswordVerificationResult.Success, hasher.VerifyHashedPassword(user, user.PasswordHash, "new-test-password"));
        Assert.IsType<UnauthorizedObjectResult>(await controller.Login(
            new AuthController.LoginRequest(user.Email, "original-test-password"), default));
        Assert.IsType<Microsoft.AspNetCore.Mvc.SignInResult>(await controller.Login(
            new AuthController.LoginRequest(user.Email, "new-test-password"), default));
        user.IsActive = false;
        await db.SaveChangesAsync();
        Assert.IsType<UnauthorizedObjectResult>(await controller.Login(
            new AuthController.LoginRequest(user.Email, "new-test-password"), default));
    }
}
