/**
 * Copyright (c) 2020, WSO2 LLC. (https://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { Chip, Typography } from "@oxygen-ui/react";
import { AutocompleteRenderGetTagProps } from "@oxygen-ui/react/Autocomplete";
import {
    AlertLevels,
    IdentifiableComponentInterface,
    RolesInterface
} from "@wso2is/core/models";
import { addAlert } from "@wso2is/core/store";
import { AutocompleteFieldAdapter, FinalForm, FinalFormField, TextFieldAdapter } from "@wso2is/form";
import { Heading, Hint, LinkButton, Message, PrimaryButton } from "@wso2is/react-components";
import { AxiosError } from "axios";
import isEmpty from "lodash-es/isEmpty";
import React, { FunctionComponent, ReactElement, ReactNode, useMemo, useState } from "react";
import { FormRenderProps } from "react-final-form";
import { useTranslation } from "react-i18next";
import { useDispatch } from "react-redux";
import { Dispatch } from "redux";
import { Grid, Modal } from "semantic-ui-react";
// Keep statement as this to avoid cyclic dependency. Do not import from config index.
import { UsersConstants } from "../../../../extensions/components/users/constants";
import { useRolesList } from "../../../roles/api";
import { sendParentOrgUserInvite } from "../guests/api/invite";
import { UserInviteInterface } from "../guests/models/invite";


interface RolesAutoCompleteOption {
    key: string;
    label: ReactNode;
    role: RolesInterface;
}

interface InviteParentOrgUserWizardFormValuesInterface {
    username: string;
    roles: RolesAutoCompleteOption[];
}

interface InviteParentOrgUserWizardFormErrorsInterface {
    username: string;
    roles: string;
}

interface InviteParentOrgUserWizardPropsInterface extends IdentifiableComponentInterface {
    closeWizard: () => void;
    updateList?: () => void;
}

const INVITE_PARENT_ORG_USER_FORM_ID: string = "invite-parent-org-user-form";

/**
 * The invite parent organization user wizard component.
 *
 * @returns Invite parent organization user wizard.
 */
export const InviteParentOrgUserWizard: FunctionComponent<InviteParentOrgUserWizardPropsInterface> = (
    props: InviteParentOrgUserWizardPropsInterface
): ReactElement => {

    const {
        closeWizard,
        updateList,
        [ "data-componentid"]: componentId
    } = props;

    const { t } = useTranslation();
    const dispatch: Dispatch = useDispatch();
    const [ isSubmitting, setIsSubmitting ] = useState<boolean>(false);
    const { data: allowedRoles } = useRolesList();

    const rolesAutocompleteOptions: RolesAutoCompleteOption[] = useMemo(() => {

        if (isEmpty(allowedRoles?.Resources)) {
            return [];
        }

        return allowedRoles?.Resources
            ?.filter((role: RolesInterface) => role.audience.display !== "Console")
            ?.map((role: RolesInterface) => {
                return {
                    key: role.id,
                    label: role.displayName,
                    role
                };
            });
    }, [ allowedRoles ]);

    const handleParentOrgUserInviteError = (error: AxiosError) => {

        /**
         * Axios throws a generic `Network Error` for status code 401.
         * As a temporary solution, a check to see if a response
         * is available has been used.
         */
        if (!error.response || error.response.status === 401) {
            dispatch(addAlert({
                description: t("console:manage.features.invite.notifications.sendInvite.error.description"),
                level: AlertLevels.ERROR,
                message: t("console:manage.features.invite.notifications.sendInvite.error.message")
            }));
        } else if (error.response.status === 403 &&
            error?.response?.data?.code === UsersConstants.ERROR_COLLABORATOR_USER_LIMIT_REACHED) {
            dispatch(addAlert({
                description: t("extensions:manage.invite.notifications.sendInvite.limitReachError.description"),
                level: AlertLevels.ERROR,
                message: t("extensions:manage.invite.notifications.sendInvite.limitReachError.message")
            }));
        } else if (error?.response?.data?.description) {
            dispatch(addAlert({
                description: t(
                    "console:manage.features.invite.notifications.sendInvite.error.description",
                    { description: error.response.data.description }
                ),
                level: AlertLevels.ERROR,
                message: t("console:manage.features.invite.notifications.sendInvite.error.message")
            }));
        } else {
            // Generic error message
            dispatch(addAlert({
                description: t(
                    "console:manage.features.invite.notifications.sendInvite.genericError.description"
                ),
                level: AlertLevels.ERROR,
                message: t("console:manage.features.invite.notifications.sendInvite.genericError.message")
            }));
        }
    };

    /**
     * This function handles sending the invitation to the external admin user.
     */
    const sendParentOrgInvitation = (values: InviteParentOrgUserWizardFormValuesInterface) => {

        const invite: UserInviteInterface = {
            roles: values?.roles?.map((role: RolesAutoCompleteOption) => role.role.id),
            username: values?.username
        };

        setIsSubmitting(true);

        sendParentOrgUserInvite(invite)
            .then(() => {
                dispatch(addAlert({
                    description: t(
                        "console:manage.features.invite.notifications.sendInvite.success.description"
                    ),
                    level: AlertLevels.SUCCESS,
                    message: t(
                        "console:manage.features.invite.notifications.sendInvite.success.message"
                    )
                }));
                closeWizard();
            })
            .catch((error: AxiosError) => {
                handleParentOrgUserInviteError(error);
            })
            .finally(() => {
                closeWizard();
                setIsSubmitting(false);
            });
    };

    const validateInviteParentOrgUserForm = (
        values: InviteParentOrgUserWizardFormValuesInterface
    ): InviteParentOrgUserWizardFormErrorsInterface => {

        const errors: InviteParentOrgUserWizardFormErrorsInterface = {
            roles: undefined,
            username: undefined
        };

        if (!values.username) {
            errors.username = t("console:manage.features.parentOrgInvitations.addUserWizard.username.validations" +
                ".required");
        }

        if (!values.roles || isEmpty(values.roles)) {
            errors.roles =  t("console:manage.features.parentOrgInvitations.addUserWizard.roles.validations.required");
        }

        return errors;
    };

    const renderModalContent = (): ReactElement => {

        return (
            <FinalForm
                initialValues={ null }
                keepDirtyOnReinitialize={ true }
                data-componentid={ `${ componentId }-external-form` }
                onSubmit={ sendParentOrgInvitation }
                validate={ validateInviteParentOrgUserForm }
                render={ ({ handleSubmit }: FormRenderProps) => {
                    return (
                        <form
                            id={ INVITE_PARENT_ORG_USER_FORM_ID }
                            onSubmit={ handleSubmit }
                            className="invite-parent-org-user-form">
                            <Message
                                type="info"
                                className="add-user-info"
                                content={ t("console:manage.features.parentOrgInvitations.addUserWizard.hint") }
                            />
                            <FinalFormField
                                fullWidth
                                ariaLabel="Username field"
                                data-componentid={ `${componentId}-external-form-username-input` }
                                label={ t("console:manage.features.parentOrgInvitations.addUserWizard.username.label") }
                                name="username"
                                placeholder={ t(
                                    "console:manage.features.parentOrgInvitations.addUserWizard.username.placeholder"
                                ) }
                                required={ true }
                                type="text"
                                tabIndex={ 5 }
                                helperText={ (
                                    <Hint>
                                        <Typography variant="inherit">
                                            { t("console:manage.features.parentOrgInvitations.addUserWizard.username" +
                                                ".hint") }
                                        </Typography>
                                    </Hint>
                                ) }
                                component={ TextFieldAdapter }
                            />
                            <FinalFormField
                                fullWidth
                                required
                                freeSolo
                                multipleValues
                                ariaLabel="Roles field"
                                data-componentid={ `${componentId}-form-roles-field` }
                                name="roles"
                                label={ t("console:manage.features.parentOrgInvitations.addUserWizard.roles.label") }
                                helperText={
                                    (<Hint>
                                        <Typography variant="inherit">
                                            { t("console:manage.features.parentOrgInvitations.addUserWizard.roles" +
                                                ".hint") }
                                        </Typography>
                                    </Hint>)
                                }
                                placeholder={
                                    t("console:manage.features.parentOrgInvitations.addUserWizard.roles.placeholder")
                                }
                                component={ AutocompleteFieldAdapter }
                                options={ rolesAutocompleteOptions }
                                renderTags={ (value: readonly any[], getTagProps: AutocompleteRenderGetTagProps) => {
                                    return value.map((option: any, index: number) => (
                                        <Chip
                                            key={ index }
                                            size="medium"
                                            label={ option.label }
                                            { ...getTagProps({ index }) }
                                        />
                                    ));
                                } }
                            />
                        </form>
                    );
                } }
            />
        );
    };

    const renderModalActions = (): ReactElement => {
        return (
            <Grid>
                <Grid.Row column={ 1 }>
                    <Grid.Column mobile={ 8 } tablet={ 8 } computer={ 8 }>
                        <LinkButton
                            data-componentid={ `${ componentId }-cancel-button` }
                            floated="left"
                            onClick={ () => {
                                updateList();
                                closeWizard();
                            } }
                        >
                            <Typography variant="inherit">{ t("common:cancel") }</Typography>
                        </LinkButton>
                    </Grid.Column>
                    <Grid.Column mobile={ 8 } tablet={ 8 } computer={ 8 }>
                        <PrimaryButton
                            tabIndex={ 8 }
                            data-componentid={ `${componentId}-submit-button` }
                            floated="right"
                            loading={ isSubmitting }
                            onClick={ () => {
                                document
                                    .getElementById(INVITE_PARENT_ORG_USER_FORM_ID)
                                    .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
                            } }
                        >
                            <Typography variant="inherit">
                                { t("console:manage.features.parentOrgInvitations.addUserWizard.inviteButton") }
                            </Typography>
                        </PrimaryButton>
                    </Grid.Column>
                </Grid.Row>
            </Grid>
        );
    };

    return (
        <Modal
            data-componentid={ componentId }
            open={ true }
            className="wizard application-create-wizard"
            dimmer="blurring"
            size="small"
            onClose={ closeWizard }
            closeOnDimmerClick={ false }
            closeOnEscape
        >
            <Modal.Header className="wizard-header">
                <Typography variant="inherit">
                    { t("console:manage.features.parentOrgInvitations.addUserWizard.heading") }
                </Typography>
                <Heading as="h6">
                    <Typography variant="inherit">
                        { t("console:manage.features.parentOrgInvitations.addUserWizard.description") }
                    </Typography>
                </Heading>
            </Modal.Header>
            <Modal.Content className="content-container" scrolling>
                { renderModalContent() }
            </Modal.Content>
            <Modal.Actions>
                { renderModalActions() }
            </Modal.Actions>
        </Modal>
    );
};

/**
 * Default props for the invite parent org user wizard component.
 */
InviteParentOrgUserWizard.defaultProps = {
    "data-componentid": "invite-parent-org-user"
};
