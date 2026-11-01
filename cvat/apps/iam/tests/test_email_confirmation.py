# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

from allauth.account.models import EmailAddress, EmailConfirmationHMAC
from django.conf import settings
from django.contrib.auth import SESSION_KEY
from django.test import override_settings
from django.urls import include, path, re_path, reverse
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from cvat.apps.iam.views import ConfirmEmailViewEx

urlpatterns = [
    path("api/", include("cvat.apps.iam.urls")),
    re_path(
        r"^account-confirm-email/(?P<key>[-:\w]+)/$",
        ConfirmEmailViewEx.as_view(),
        name="account_confirm_email",
    ),
]


@override_settings(
    ACCOUNT_SIGNUP_FIELDS=["email*", "username*", "password1*", "password2*"],
    ACCOUNT_EMAIL_VERIFICATION="mandatory",
    ACCOUNT_CONFIRM_EMAIL_ON_GET=True,
    ACCOUNT_LOGIN_ON_EMAIL_CONFIRMATION=False,
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    ROOT_URLCONF=__name__,
)
class EmailConfirmationTestCase(APITestCase):
    def test_confirmation_in_registration_and_new_sessions(self):
        for same_session in (True, False):
            with self.subTest(same_session=same_session):
                email = f"confirmation-{int(same_session)}@example.com"
                response = self.client.post(
                    reverse("rest_register"),
                    {
                        "username": f"confirmation-{same_session}",
                        "email": email,
                        "password1": "$Test357Test%",
                        "password2": "$Test357Test%",
                        "confirmations": [],
                    },
                    format="json",
                )
                self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
                self.assertTrue(response.data["email_verification_required"])
                self.assertIsNone(response.data["key"])
                address = EmailAddress.objects.get(email=email)
                self.assertFalse(address.verified)
                client = self.client if same_session else APIClient()
                url = reverse(
                    "account_confirm_email", kwargs={"key": EmailConfirmationHMAC(address).key}
                )
                self.assertRedirects(
                    client.get(url),
                    settings.ACCOUNT_EMAIL_CONFIRMATION_ANONYMOUS_REDIRECT_URL,
                    fetch_redirect_response=False,
                )
                address.refresh_from_db()
                self.assertTrue(address.verified)
                self.assertNotIn("account_login", client.session)
                self.assertNotIn(SESSION_KEY, client.session)
                self.client = APIClient()

    def test_login_stage_redirect_reaches_ui(self):
        self.assertRedirects(
            self.client.get(reverse("account_login")),
            f"{settings.UI_URL}/auth/login",
            fetch_redirect_response=False,
        )
