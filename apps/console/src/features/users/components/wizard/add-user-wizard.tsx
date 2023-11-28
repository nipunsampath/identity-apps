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

import { IdentityAppsApiException } from "@wso2is/core/exceptions";
import {
    AlertLevels,
    IdentifiableComponentInterface,
    ProfileSchemaInterface,
    RolesInterface,
    TestableComponentInterface
} from "@wso2is/core/models";
import { addAlert } from "@wso2is/core/store";
import { useTrigger } from "@wso2is/forms";
import { Heading, LinkButton, PrimaryButton, Steps, useWizardAlert } from "@wso2is/react-components";
import { UserTypeSelection } from "apps/console/src/extensions/components/users/wizard";
import { AxiosError, AxiosResponse } from "axios";
import cloneDeep from "lodash-es/cloneDeep";
import intersection from "lodash-es/intersection";
import merge from "lodash-es/merge";
import React, { FunctionComponent, ReactElement, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDispatch, useSelector } from "react-redux";
import { Dispatch } from "redux";
import { DropdownItemProps, Grid, Icon, Modal } from "semantic-ui-react";
import { AddConsumerUserWizardSummary } from "./steps/add-consumer-user-wizard-summary";
import { AddConsumerUserGroups } from "./steps/consumer-user-groups";
import { RolePermissions } from "./user-role-permissions";
import { AddUserWizardSummary } from "./user-wizard-summary";
// Keep statement as this to avoid cyclic dependency. Do not import from config index.
import { UserAccountTypes, UsersConstants } from "../../../../extensions/components/users/constants";
import { SCIMConfigs } from "../../../../extensions/configs/scim";
import useAuthorization from "../../../authorization/hooks/use-authorization";
import { UserStoreDetails, UserStoreProperty } from "../../../core/models";
import { AppState } from "../../../core/store";
import { GroupsInterface } from "../../../groups";
import { getGroupList, updateGroupDetails } from "../../../groups/api";
import { getOrganizationRoles } from "../../../organizations/api";
import { OrganizationRoleManagementConstants, OrganizationType } from "../../../organizations/constants";
import { useGetCurrentOrganizationType } from "../../../organizations/hooks/use-get-organization-type";
import { OrganizationResponseInterface, OrganizationRoleListItemInterface,
    OrganizationRoleListResponseInterface } from "../../../organizations/models";
import { getRolesList, updateRoleDetails } from "../../../roles/api";
import { getUserStores } from "../../../userstores/api";
import { useValidationConfigData } from "../../../validation/api";
import { ValidationFormInterface } from "../../../validation/models";
import { addUser } from "../../api";
import { getUserWizardStepIcons } from "../../configs";
import { AdminAccountTypes, HiddenFieldNames, PasswordOptionTypes, UserAccountTypesMain } from "../../constants";
import { 
    AddUserWizardStateInterface, 
    PayloadInterface,
    UserDetailsInterface, 
    WizardStepInterface,
    createEmptyUserDetails } from "../../models";
import { generatePassword, getConfiguration, getUsernameConfiguration } from "../../utils";
import { AddUserGroup } from "../add-user-groups";
import { AddUserRole } from "../add-user-role";
import { AddUserUpdated } from "../add-user-updated";

interface AddUserWizardPropsInterface extends IdentifiableComponentInterface, TestableComponentInterface {
    closeWizard: () => void;
    compact?: boolean;
    currentStep?: number;
    submitStep?: WizardStepsFormTypes | string;
    listOffset: number;
    listItemLimit: number;
    updateList: () => void;
    onSuccessfulUserAddition?: (id: string) => void;
    rolesList?: any;
    emailVerificationEnabled: boolean;
    isAdminUser?: boolean;
    userTypeSelection?: string
    defaultUserTypeSelection?: string;
    adminTypeSelection? :string;
    isSubOrg?: boolean
    showStepper?: boolean;
    conditionallyShowStepper?: boolean;
    requiredSteps?: WizardStepsFormTypes[] | string[];
    userStore?: string;
    requestedPasswordOption?: PasswordOptionTypes;
}

/**
 * Interface for the wizard state.
 */
interface WizardStateInterface {
    [ key: string ]: any;
}

/**
 * Enum for wizard steps form types.
 * @readonly
 */
enum WizardStepsFormTypes {
    BASIC_DETAILS = "BasicDetails",
    ROLE_LIST= "RoleList",
    GROUP_LIST= "GroupList",
    SUMMARY = "summary",
    USER_TYPE = "UserType",
    USER_SUMMARY = "UserSummary"
}

/**
 * User creation wizard.
 *
 * @returns User creation wizard.
 */
export const AddUserWizard: FunctionComponent<AddUserWizardPropsInterface> = (
    props: AddUserWizardPropsInterface
): ReactElement => {

    const {
        adminTypeSelection,
        closeWizard,
        currentStep,
        defaultUserTypeSelection,
        emailVerificationEnabled,
        isAdminUser,
        isSubOrg,
        onSuccessfulUserAddition,
        submitStep,
        updateList,
        userStore,
        userTypeSelection,
        requiredSteps,
        [ "data-testid" ]: testId
    } = props;

    const { t } = useTranslation();
    const dispatch: Dispatch = useDispatch();
    const [ alert, setAlert, alertComponent ] = useWizardAlert();
    const { organizationType } = useGetCurrentOrganizationType();

    const [ submitGeneralSettings, setSubmitGeneralSettings ] = useTrigger();
    const [ submitRoleList, setSubmitRoleList ] = useTrigger();
    const [ submitGroupList, setSubmitGroupList ] = useTrigger();
    const [ finishSubmit, setFinishSubmit ] = useTrigger();
    const [ submitUserTypeSelection, setSubmitUserTypeSelection ] = useTrigger();

    const currentOrganization: OrganizationResponseInterface = useSelector((state: AppState) =>
        state.organization.organization);
    const profileSchemas: ProfileSchemaInterface[] = useSelector(
        (state: AppState) => state.profile.profileSchemas);
    
    const [ partiallyCompletedStep, setPartiallyCompletedStep ] = useState<number>(undefined);
    const [ currentWizardStep, setCurrentWizardStep ] = useState<number>(currentStep);
    const [ wizardState, setWizardState ] = useState<WizardStateInterface>(undefined);
    const [ fixedGroupList, setFixedGroupsList ] = useState<GroupsInterface[]>(undefined);
    const [ roleList, setRoleList ] = useState<RolesInterface[] | OrganizationRoleListItemInterface[]>([]);
    const [ tempRoleList, setTempRoleList ] = useState<RolesInterface[] | OrganizationRoleListItemInterface[]>(
        []);
    const [ initialRoleList, setInitialRoleList ] = useState<RolesInterface[] | OrganizationRoleListItemInterface[]>(
        []);
    const [ initialTempRoleList, setInitialTempRoleList ] = useState<RolesInterface[]
        | OrganizationRoleListItemInterface[]>([]);
    const [ groupList, setGroupsList ] = useState<GroupsInterface[]>([]);
    const [ tempGroupList, setTempGroupList ] = useState<GroupsInterface[]>([]);
    const [ initialGroupList, setInitialGroupList ] = useState<GroupsInterface[]>([]);
    const [ initialTempGroupList, setInitialTempGroupList ] = useState<GroupsInterface[]>([]);
    const [ viewRolePermissions, setViewRolePermissions ] = useState<boolean>(false);
    const [ selectedRoleId,  setSelectedRoleId ] = useState<string>();
    const [ isRoleSelected, setRoleSelection ] = useState<boolean>(false);
    const [ isSubmitting, setIsSubmitting ] = useState<boolean>(false);
    const [ viewNextButton, setViewNextButton ] = useState<boolean>(true);
    const [ isAlphanumericUsername, setIsAlphanumericUsername ] = useState<boolean>(false);
    const [ isFinishButtonDisabled, setFinishButtonDisabled ] = useState<boolean>(false);
    const [ isBasicDetailsLoading, setBasicDetailsLoading ] = useState<boolean>(false);
    const [ isStepsUpdated, setIsStepsUpdated ] = useState<boolean>(false);
    const [ isFirstNameRequired, setFirstNameRequired ] = useState<boolean>(true);
    const [ isLastNameRequired, setLastNameRequired ] = useState<boolean>(true);
    const [ isEmailRequired, setEmailRequired ] = useState<boolean>(false);
    const [ askPasswordFromUser, setAskPasswordFromUser ] = useState<boolean>(true);
    const [ isOfflineUser, setOfflineUser ] = useState<boolean>(false);
    const [ wizardSteps, setWizardSteps ] = useState<WizardStepInterface[]>([]);
    const [ selectedUserStore, setSelectedUserStore ] = useState<string>("PRIMARY");
    const [ hiddenFields, setHiddenFields ] =
        useState<(HiddenFieldNames)[]>([]);
    const [ readWriteUserStoresList, setReadWriteUserStoresList ] = useState<DropdownItemProps[]>([]);
    const [ isUserStoreError, setUserStoreError ] = useState<boolean>(false);
    const [ isUserSummaryEnabled, setUserSummaryEnabled ] = useState(false);
    const [ newUserId, setNewUserId ] = useState<string>("");
    const { legacyAuthzRuntime } = useAuthorization();

    const excludedAttributes: string = "members";

    const {
        data: validationData
    } = useValidationConfigData();

    /**
     * Update selected user store when userStore changes
     */
    useEffect(() => {
        setSelectedUserStore(userStore);
    }, [ userStore ]);

    /**
     * Toggle view settings based on current wizard step
     */
    useEffect(() => {
        if (currentWizardStep != 3) {
            setViewRolePermissions(false);
        }
        setViewNextButton(true);
    }, [ currentWizardStep ]);

    /**
     * Fetch group list based on selected user store or reset groups if not a user
     */
    useEffect(() => {
        if (defaultUserTypeSelection === UserAccountTypes.USER) {
            getGroupListForDomain(selectedUserStore);
        } else {
            setGroupsList([]);
            setInitialGroupList([]);
            setFixedGroupsList([]);
        }
    }, [ selectedUserStore ]);

    /**
     * Set user type in wizard state based on defaultUserTypeSelection
     */
    useEffect(() => {

        if (!defaultUserTypeSelection) {
            return;
        }

        setWizardState({
            ...wizardState,
            [ WizardStepsFormTypes.USER_TYPE ]: {
                userType: defaultUserTypeSelection
            }
        });

    }, [ defaultUserTypeSelection ]);

    /**
     * Determine if alphanumeric username is enabled
     */
    useEffect(() => {
        setIsAlphanumericUsername(
            getUsernameConfiguration(validationData)?.enableValidator === "true"
                ? true
                : false
        );
    }, [ validationData ]);

    /**
     * Toggle view of role permissions based on role selection
     */
    useEffect(() => {
        if (defaultUserTypeSelection === UserAccountTypes.USER) {
            getGroupListForDomain(selectedUserStore);
        } else {
            setGroupsList([]);
            setInitialGroupList([]);
            setFixedGroupsList([]);
        }
    }, [ selectedUserStore ]);

    useEffect(() => {

        if (!defaultUserTypeSelection) {
            return;
        }

        setWizardState({
            ...wizardState,
            [ WizardStepsFormTypes.USER_TYPE ]: {
                userType: defaultUserTypeSelection
            }
        });

    }, [ defaultUserTypeSelection ]);

    useEffect(() => {
        setIsAlphanumericUsername(
            getUsernameConfiguration(validationData)?.enableValidator === "true"
                ? true
                : false
        );
    }, [ validationData ]);

    useEffect(() => {
        if (!selectedRoleId) {
            return;
        }

        if (isRoleSelected) {
            setViewRolePermissions(true);
        }
    }, [ isRoleSelected ]);

    /**
     * Fetch initial role list based on conditions
     */
    useEffect(() => {
        if (initialRoleList.length === 0) {
            if (organizationType === OrganizationType.SUPER_ORGANIZATION
                || organizationType === OrganizationType.FIRST_LEVEL_ORGANIZATION
                || !legacyAuthzRuntime
            ) {
                // Get Roles from the SCIM API
                getRolesList(null)
                    .then((response: AxiosResponse) => {
                        setRoleList(response.data.Resources);
                        setInitialRoleList(response.data.Resources);
                    });
            } else {
                // Get Roles from the Organization API
                getOrganizationRoles(currentOrganization.id, null, 100, null)
                    .then((response: OrganizationRoleListResponseInterface) => {
                        if (!response.Resources) {
                            return;
                        }

                        const roles: OrganizationRoleListItemInterface[] = response.Resources
                            .filter((role: OrganizationRoleListItemInterface) =>
                                role.displayName !== OrganizationRoleManagementConstants.ORG_CREATOR_ROLE_NAME);

                        setRoleList(roles);
                        setInitialRoleList(roles);
                    });
            }
        }

        getUserStoreList();
        resolveNamefieldAttributes(profileSchemas);
    }, []);

    /**
     * Sets the current wizard step to the previous on every `partiallyCompletedStep`
     * value change , and resets the partially completed step value.
     */
    useEffect(() => {
        if (partiallyCompletedStep === undefined) {
            return;
        }

        setCurrentWizardStep(currentWizardStep - 1);
        setPartiallyCompletedStep(undefined);
    }, [ partiallyCompletedStep ]);

    /**
     * Fetch group list based on domain in basic details of wizardState
     */
    useEffect(() => {
        if ( wizardState && wizardState[ WizardStepsFormTypes.BASIC_DETAILS ]?.domain) {
            getGroupListForDomain(wizardState && wizardState[ WizardStepsFormTypes.BASIC_DETAILS ]?.domain);
        }
    }, [ wizardState && wizardState[ WizardStepsFormTypes.BASIC_DETAILS ]?.domain ]);

    useEffect(() => {
        if (!(wizardState && wizardState[ WizardStepsFormTypes.USER_TYPE ])) {
            return;
        }

        if (!fixedGroupList) {
            return;
        }

        if (wizardState[ WizardStepsFormTypes.USER_TYPE ].userType === UserAccountTypes.USER) {
            if (fixedGroupList?.length === 0) {
                if (isUserSummaryEnabled) {
                    setWizardSteps(filterSteps([
                        WizardStepsFormTypes.BASIC_DETAILS,
                        WizardStepsFormTypes.USER_SUMMARY
                    ]));
                    setIsStepsUpdated(true);

                    return;
                }
                setWizardSteps(filterSteps([
                    // TODO: Enable temporarily disabled USER_TYPE step.
                    WizardStepsFormTypes.BASIC_DETAILS
                    // TODO: Enable temporarily disabled summary step.
                ]));
                setIsStepsUpdated(true);

                return;
            } 

            if (isUserSummaryEnabled) {
                setWizardSteps(filterSteps([
                    WizardStepsFormTypes.BASIC_DETAILS,
                    WizardStepsFormTypes.GROUP_LIST,
                    WizardStepsFormTypes.ROLE_LIST,
                    WizardStepsFormTypes.USER_SUMMARY
                ]));
                setIsStepsUpdated(true);

                return;
            }

            setWizardSteps(filterSteps([
                // TODO: Enable temporarily disabled  USER_TYPE step.
                WizardStepsFormTypes.BASIC_DETAILS,
                WizardStepsFormTypes.GROUP_LIST,
                WizardStepsFormTypes.ROLE_LIST
                // TODO: Enable temporarily disabled summary step.
            ]));
            setIsStepsUpdated(true);
        } else {
            setWizardSteps(filterSteps([
                // TODO: Enable temporarily disabled USER_TYPE step.
                WizardStepsFormTypes.BASIC_DETAILS ]));
            setIsStepsUpdated(true);
        }

    }, [ fixedGroupList, wizardState && wizardState[ WizardStepsFormTypes.USER_TYPE ].userType, 
        isUserSummaryEnabled ]);

    /**
     * Function to fetch and update group list for a given domain
     */
    const getGroupListForDomain = (domain: string) => {
        setBasicDetailsLoading(true);
        getGroupList(domain, excludedAttributes)
            .then((response: AxiosResponse) => {
                if (response.data.totalResults == 0) {
                    setGroupsList([]);
                    setInitialGroupList([]);
                    setFixedGroupsList([]);
                } else {
                    setGroupsList(response.data.Resources);
                    setInitialGroupList(response.data.Resources);
                    setFixedGroupsList(response.data.Resources);
                }
            }).catch((error: AxiosError) => {
                if (error?.response?.data?.description) {
                    dispatch(addAlert({
                        description: error?.response?.data?.description ?? error?.response?.data?.detail
                        ?? 
                        t("console:manage.features.user.updateUser.groups.notifications" + 
                        ".fetchUserGroups.error.description"),
                        level: AlertLevels.ERROR,
                        message: error?.response?.data?.message
                        ?? t("console:manage.features.user.updateUser.groups.notifications" + 
                        ".fetchUserGroups.error.message")
                    }));

                    return;
                }

                dispatch(addAlert({
                    description: t("console:manage.features.user.updateUser.groups.notifications" + 
                    ".fetchUserGroups.genericError.description"),
                    level: AlertLevels.ERROR,
                    message: t("console:manage.features.user.updateUser.groups.notifications" + 
                    ".fetchUserGroups.genericError.message")
                }));
            }).finally(() => setBasicDetailsLoading(false));
    };

    const getUserStoreList = (): void => {
        setBasicDetailsLoading(true);
        const userStoreArray: DropdownItemProps[] = [
            {
                key: -1,
                text: t("console:manage.features.users.userstores.userstoreOptions.primary"),
                value: "PRIMARY"
            }
        ];

        getUserStores(null)
            .then((response: UserStoreDetails[]) => {

                response?.forEach((item: UserStoreDetails, index: number) => {
                    // Set read/write enabled userstores based on the type.
                    if (checkReadWriteUserStore(item)) {    
                        userStoreArray.push({
                            key: index,
                            text: item.name.toUpperCase(),
                            value: item.name.toUpperCase()
                        });
                    }});

                setUserStoreError(false);
                setReadWriteUserStoresList(userStoreArray);
            }).catch((error: IdentityAppsApiException) => {
                if (error?.response?.data?.description) {
                    dispatch(addAlert({
                        description: error?.response?.data?.description ?? error?.response?.data?.detail
                            ?? t("console:manage.features.users.notifications.fetchUserStores.error.description"),
                        level: AlertLevels.ERROR,
                        message: error?.response?.data?.message
                            ?? t("console:manage.features.users.notifications.fetchUserStores.error.message")
                    }));

                    return;
                }

                dispatch(addAlert({
                    description: t("console:manage.features.users.notifications.fetchUserStores.genericError." +
                        "description"),
                    level: AlertLevels.ERROR,
                    message: t("console:manage.features.users.notifications.fetchUserStores.genericError.message")
                }));

                setUserStoreError(true);

                return;
            })
            .finally(() => {
                setBasicDetailsLoading(false);
            });
    };

    /**
     * Check the given user store is Read/Write enabled
     * 
     * @param userStore - Userstore
     * @returns If the given userstore is read only or not
     */
    const checkReadWriteUserStore = (userStore: UserStoreDetails): boolean => {
        if( userStore.typeName === UsersConstants.DEFAULT_USERSTORE_TYPE_NAME ) {
            return true;
        } else {
            return  userStore.enabled && userStore.properties.filter((property: UserStoreProperty)=>
                property.name===UsersConstants.USER_STORE_PROPERTY_READ_ONLY)[0].value==="false";
        }
    };

    const resolveNamefieldAttributes = (profileSchemas: ProfileSchemaInterface[]) => {
        const hiddenAttributes: (HiddenFieldNames)[] = [];
        const nameSchema: ProfileSchemaInterface = profileSchemas
            .find((schema: ProfileSchemaInterface) => schema.name === "name");
        const emailSchema: ProfileSchemaInterface = profileSchemas
            .find((schema: ProfileSchemaInterface) => (schema.name === "emails"));

        if (emailSchema) {
            hiddenAttributes.push(HiddenFieldNames.EMAIL);
            setEmailRequired(emailSchema.required);
        }

        if (nameSchema?.subAttributes?.length > 0) {
            // Check for presence of firstName, lastName attributes.
            const firstNameAttribute: ProfileSchemaInterface = nameSchema.subAttributes
                .find((attribute: ProfileSchemaInterface) => attribute.name === "givenName");
            const lastNameAttribute: ProfileSchemaInterface = nameSchema.subAttributes
                .find((attribute: ProfileSchemaInterface) => attribute.name === "familyName");

            if (firstNameAttribute && lastNameAttribute) {
                setFirstNameRequired(firstNameAttribute.required);
                setLastNameRequired(lastNameAttribute.required);

                return;
            }
            
            if (firstNameAttribute) {
                // First Name attribute is available.
                // But Last Name attribute is not available
                hiddenAttributes.push(HiddenFieldNames.LASTNAME);
                setFirstNameRequired(firstNameAttribute.required);
            }

            if (lastNameAttribute) {
                // Last Name attribute is available.
                // But First Name attribute is not available
                hiddenAttributes.push(HiddenFieldNames.FIRSTNAME);
                setLastNameRequired(lastNameAttribute.required);
            }
        } else {
            // If nameSchema is not present, firstName and lastName is set
            // to be not visible on the attributes.
            // Therefore it is hidden from the add user wizard.
            hiddenAttributes.push(HiddenFieldNames.FIRSTNAME, HiddenFieldNames.LASTNAME);
        }
        setHiddenFields(hiddenAttributes);
    };

    /**
     * The following function generate a random password.
     */
    const generateRandomPassword = (): string => {

        const config: ValidationFormInterface = getConfiguration(validationData);

        if (config === undefined) {
            return generatePassword(10, true, true, true, true, 1, 1, 1, 1);
        } else {
            return generatePassword(Number(config.minLength), Number(config.minLowerCaseCharacters) > 0,
                Number(config.minUpperCaseCharacters) > 0, Number(config.minNumbers) > 0,
                Number(config.minSpecialCharacters) > 0, Number(config.minLowerCaseCharacters),
                Number(config.minUpperCaseCharacters), Number(config.minNumbers),
                Number(config.minSpecialCharacters), Number(config.minUniqueCharacters));
        }
    };

    /**
     * Filters the steps evaluating the requested steps.
     *
     * @param steps - Steps to filter.
     * @returns Filtered steps.
     */
    const filterSteps = (steps: WizardStepsFormTypes[]): WizardStepInterface[] => {
        const getStepContent = (stepsToFilter: WizardStepsFormTypes[] | string[]) => {

            const filteredSteps: any[] = [];

            stepsToFilter.forEach((step: WizardStepsFormTypes) => {
                if (step === WizardStepsFormTypes.USER_TYPE) {
                    filteredSteps.push(getUserSelectionWizardStep());
                } else if (step === WizardStepsFormTypes.GROUP_LIST) {
                    filteredSteps.push(getUserGroupsWizardStep());
                } else if (step === WizardStepsFormTypes.ROLE_LIST) {
                    filteredSteps.push(getUserRoleWizardStep());
                } else if (step === WizardStepsFormTypes.SUMMARY) {
                    filteredSteps.push(getSummaryWizardStep());
                } else if (step === WizardStepsFormTypes.USER_SUMMARY) {
                    filteredSteps.push(getUserSummaryWizardStep());
                }
            });

            return filteredSteps;
        };

        if (!requiredSteps) {
            return getStepContent(steps);
        }

        return getStepContent(intersection(steps, requiredSteps));
    };

    /**
     * User Type Selection Wizard Step.
     * @returns User type wizard step.
     */
    const getUserSelectionWizardStep = (): WizardStepInterface => {

        return {
            content: (
                <UserTypeSelection
                    handleTriggerSubmit={ () => setSubmitUserTypeSelection }
                    triggerSubmit={ submitUserTypeSelection }
                    initialValues={ wizardState && wizardState[ WizardStepsFormTypes.USER_TYPE ] }
                    onSubmit={ (values: { userType: string }) => 
                        handleWizardFormSubmit(values, WizardStepsFormTypes.USER_TYPE) }
                />
            ),
            icon: getUserWizardStepIcons().user,
            name: WizardStepsFormTypes.USER_TYPE,
            title: "User Type"
        };
    };

    const handleViewRolePermission = () => {
        setViewRolePermissions(!viewRolePermissions);
        setRoleSelection(false);
    };

    const handleViewNextButton = (show: boolean) => {
        setViewNextButton(show);
    };

    const handleRoleIdSet = (roleId: string) => {
        setSelectedRoleId(roleId);
        setRoleSelection(true);
    };

    const handleRoleListChange = (roleList: RolesInterface[] | OrganizationRoleListItemInterface[]) => {
        setRoleList(roleList);
    };

    const handleInitialRoleListChange = (roleList: RolesInterface[] | OrganizationRoleListItemInterface[]) => {
        setInitialRoleList(roleList);
    };

    const handleAddedListChange = (newRoleList: RolesInterface[] | OrganizationRoleListItemInterface[]) => {
        setTempRoleList(newRoleList);
    };

    const handleAddedRoleInitialListChange = (newRoleList: RolesInterface[] | OrganizationRoleListItemInterface[]) => {
        setInitialTempRoleList(newRoleList);
    };

    const handleGroupListChange = (groupList: GroupsInterface[]) => {
        setGroupsList(groupList);
    };

    const handleInitialGroupListChange = (groupList: GroupsInterface[]) => {
        setInitialGroupList(groupList);
    };

    const handleAddedGroupListChange = (newGroupList: GroupsInterface[]) => {
        setTempGroupList(newGroupList);
    };

    const handleAddedGroupInitialListChange = (newGroupList: GroupsInterface[]) => {
        setInitialTempGroupList(newGroupList);
    };

    const navigateToNext = () => {
        switch (currentWizardStep) {
            case 0:
                setSubmitGeneralSettings();

                break;
            case 1:
                isAdminUser
                    ? setFinishSubmit()
                    : setSubmitGroupList();

                break;
            case 2:
                setSubmitRoleList();

                break;
            case 3:
                setFinishSubmit();
                onSuccessfulUserAddition(newUserId);
                closeWizard();

                break;
            default:
                break;
        }
    };

    const navigateToPrevious = () => {
        setPartiallyCompletedStep(currentWizardStep);
    };

    /**
     * This function handles assigning the roles to the user.
     */
    const assignUserRole = (user: any, roles: any, groups: any) => {
        const roleIds: string[] = [];
        const groupIds: string[] = [];

        // Payload for the update role request.
        const roleData: PayloadInterface = {
            Operations: [
                {
                    op: "add",
                    value: {
                        users: [
                            {
                                display: user.userName,
                                value: user.id
                            }
                        ]
                    }
                }
            ],
            schemas: [ "urn:ietf:params:scim:api:messages:2.0:PatchOp" ]
        };

        // Payload for the update group request.
        const groupData: PayloadInterface = {
            Operations: [
                {
                    op: "add",
                    value: {
                        members: [
                            {
                                display: user.userName,
                                value: user.id
                            }
                        ]
                    }
                }
            ],
            schemas: [ "urn:ietf:params:scim:api:messages:2.0:PatchOp" ]
        };

        if (roles.length > 0) {
            roles.map((role: RolesInterface | OrganizationRoleListItemInterface) => {
                roleIds.push(role.id);
            });

            for (const roleId of roleIds) {
                updateRoleDetails(roleId, roleData)
                    .catch((error: AxiosError) => {
                        if (!error.response || error.response.status === 401) {
                            setAlert({
                                description: t(
                                    "console:manage.features.users.notifications.addUser.error.description"
                                ),
                                level: AlertLevels.ERROR,
                                message: t(
                                    "console:manage.features.users.notifications.addUser.error.message"
                                )
                            });
                        } else if (error.response && error.response.data && error.response.data.detail) {

                            setAlert({
                                description: t(
                                    "console:manage.features.users.notifications.addUser.error.description",
                                    { description: error.response.data.detail }
                                ),
                                level: AlertLevels.ERROR,
                                message: t(
                                    "console:manage.features.users.notifications.addUser.error.message"
                                )
                            });
                        } else {
                            // Generic error message
                            setAlert({
                                description: t(
                                    "console:manage.features.users.notifications.addUser.genericError.description"
                                ),
                                level: AlertLevels.ERROR,
                                message: t(
                                    "console:manage.features.users.notifications.addUser.genericError.message"
                                )
                            });
                        }
                    });
            }
        }

        if (groups.length > 0) {
            groups.map((group: RolesInterface) => {
                groupIds.push(group.id);
            });

            for (const groupId of groupIds) {
                updateGroupDetails(groupId, groupData)
                    .catch((error: AxiosError) => {
                        if (!error.response || error.response.status === 401) {
                            setAlert({
                                description: t(
                                    "console:manage.features.users.notifications.addUser.error.description"
                                ),
                                level: AlertLevels.ERROR,
                                message: t(
                                    "console:manage.features.users.notifications.addUser.error.message"
                                )
                            });
                        } else if (error.response && error.response.data && error.response.data.detail) {

                            setAlert({
                                description: t(
                                    "console:manage.features.users.notifications.addUser.error.description",
                                    { description: error.response.data.detail }
                                ),
                                level: AlertLevels.ERROR,
                                message: t(
                                    "console:manage.features.users.notifications.addUser.error.message"
                                )
                            });
                        } else {
                            // Generic error message
                            setAlert({
                                description: t(
                                    "console:manage.features.users.notifications.addUser.genericError.description"
                                ),
                                level: AlertLevels.ERROR,
                                message: t(
                                    "console:manage.features.users.notifications.addUser.genericError.message"
                                )
                            });
                        }
                    });
            }
        }
    };

    /**
     * This function handles adding the user.
     */
    const addUserBasic = (userInfo: AddUserWizardStateInterface) => {
        let username: string = "";

        if (!isAlphanumericUsername) {
            username = userInfo.domain + "/" + userInfo.email;
        } else {
            username = userInfo.domain + "/" + userInfo.userName;
        }

        let userDetails: UserDetailsInterface = createEmptyUserDetails();
        const password: string = userInfo.newPassword;

        // Users who get invited offline are also considered as password-based users.
        // They will be assigned a randomly generated temporary password.
        // Temporary password can be changed via the offline invite link.
        if (askPasswordFromUser) {
            userDetails = {
                emails: [
                    {
                        primary: true,
                        value: userInfo.email
                    }
                ],
                name: {
                    familyName: userInfo.lastName,
                    givenName: userInfo.firstName
                },
                password: password,
                profileUrl: userInfo.profileUrl,
                userName: username
            };
        } else if (isOfflineUser) {
            userDetails = {
                emails: [
                    {
                        primary: true,
                        value: userInfo.email
                    }
                ],
                name: {
                    familyName: userInfo.lastName,
                    givenName: userInfo.firstName
                },
                password: generateRandomPassword(),
                profileUrl: userInfo.profileUrl,
                userName: username
            };
        } else {
            userDetails = {
                emails: [
                    {
                        primary: true,
                        value: userInfo.email
                    }
                ],
                name: {
                    familyName: userInfo.lastName,
                    givenName: userInfo.firstName
                },
                profileUrl: userInfo.profileUrl,
                [ SCIMConfigs.scim.enterpriseSchema ]: {
                    askPassword: "true"
                },
                userName: username
            };
        }

        setIsSubmitting(true);

        addUser(userDetails)
            .then((response: AxiosResponse) => {
                if (response.status === 202) {
                    dispatch(addAlert({
                        description: t(
                            "console:manage.features.users.notifications.addUserPendingApproval.success.description"
                        ),
                        level: AlertLevels.WARNING,
                        message: t(
                            "console:manage.features.users.notifications.addUserPendingApproval.success.message"
                        )
                    }));
                } else { 
                    dispatch(addAlert({
                        description: t(
                            "console:manage.features.users.notifications.addUser.success.description"
                        ),
                        level: AlertLevels.SUCCESS,
                        message: t(
                            "console:manage.features.users.notifications.addUser.success.message"
                        )
                    }));
                    
                    if (userInfo?.roles && userInfo?.groups) {
                        assignUserRole(response.data, userInfo?.roles, userInfo?.groups);
                    }

                    if (isAdminUser) {
                        assignUserRole(response.data, userInfo.roles, userInfo.groups);
                    } 

                    // Saving the user ID to redirect user after the summary
                    setNewUserId(response.data?.id);
                    // Close the wizard as the summary will not be shown
                    if(!isUserSummaryEnabled) {
                        closeWizard();
                        onSuccessfulUserAddition(response.data?.id);
                    } else {
                        // Once the user is created, take the user to next step which is the summary.
                        setCurrentWizardStep(currentWizardStep + 1);
                    }
                }
            })
            .catch((error: AxiosError) => {
                // Axios throws a generic `Network Error` for 401 status.
                // As a temporary solution, a check to see if a response
                // is available has be used.
                if (!error.response || error.response.status === 401) {
                    closeWizard();
                    dispatch(addAlert({
                        description: t(
                            "console:manage.features.users.notifications.addUser.error.description"
                        ),
                        level: AlertLevels.ERROR,
                        message: t(
                            "console:manage.features.users.notifications.addUser.error.message"
                        )
                    }));
                } else if (error.response && error.response.status === 403 &&
                    error.response.data && error.response.data.scimType === UsersConstants.ERROR_USER_LIMIT_REACHED) {
                    closeWizard();
                    dispatch(addAlert({
                        description: t(
                            "extensions:manage.users.notifications.addUser.customerUser.limitReachError.description"
                        ),
                        level: AlertLevels.ERROR,
                        message: t(
                            "extensions:manage.users.notifications.addUser.customerUser.limitReachError.message"
                        )
                    }));
                } else if (error.response && error.response.data && error.response.data.detail) {
                    closeWizard();
                    dispatch(addAlert({
                        description: t(
                            "console:manage.features.users.notifications.addUser.error.description",
                            { description: error.response.data.detail }
                        ),
                        level: AlertLevels.ERROR,
                        message: t(
                            "console:manage.features.users.notifications.addUser.error.message"
                        )
                    }));
                } else {
                    closeWizard();
                    // Generic error message
                    dispatch(addAlert({
                        description: t(
                            "console:manage.features.users.notifications.addUser.genericError.description"
                        ),
                        level: AlertLevels.ERROR,
                        message: t(
                            "console:manage.features.users.notifications.addUser.genericError.message"
                        )
                    }));
                }
            })
            .finally(() => {
                setIsSubmitting(false);
            });
    };

    /**
     * Handles wizard step submit.
     *
     * @param values - Forms values to be stored in state.
     * @param formType - Type of the form.
     */
    const handleWizardFormSubmit = (values: any, formType: WizardStepsFormTypes) => {
        let processedValues: any = values;        

        if (isAdminUser) {
            // Add admin group and role names to the user.
            processedValues = {
                ...processedValues,
                groups: [
                    {
                        displayName: UserAccountTypes.ADMIN
                    }
                ],
                roles: [
                    {
                        displayName: UserAccountTypes.ADMIN
                    }
                ]
            };
        }

        // Click next while in group list and summary enabled will take the user to summary page.
        if (isUserSummaryEnabled && 
            (
                formType === WizardStepsFormTypes.BASIC_DETAILS ||
                formType === WizardStepsFormTypes.GROUP_LIST ||
                formType === WizardStepsFormTypes.ROLE_LIST
            )) {
            setWizardState({ ...wizardState, [ formType ]: processedValues });
        }
        
        // If the submit step is not default, and submit step is the current step, submit the form.
        if (submitStep !== WizardStepsFormTypes.SUMMARY && submitStep === formType) {
            handleWizardFormFinish(generateWizardSummary(processedValues));

            return;
        }
    
        setCurrentWizardStep(currentWizardStep + 1);
        setWizardState({ ...wizardState, [ formType ]: processedValues });
    };

    /**
     * Generates a summary of the wizard.
     *
     * @returns Summary of the wizard.
     */
    const generateWizardSummary = (extension?: Record<string, unknown>) => {
        if (!wizardState) {
            return;
        }

        const wizardData: WizardStateInterface = { ...wizardState };

        let summary: any = {};

        if (extension) {
            summary = { ...extension };
        }

        for (const value of Object.values(wizardData)) {
            summary = {
                ...summary,
                ...value
            };
        }

        return merge(cloneDeep(summary));
    };

    const handleWizardFormFinish = (user: AddUserWizardStateInterface) => {
        let processedUser: AddUserWizardStateInterface = user;
        
        if (isAdminUser) {
            // If the user is an admin user, skip the group and role selection steps.
            // Find admin group and add it to the group list.
            const adminGroup: GroupsInterface = initialGroupList.find(
                (group: RolesInterface) => group.displayName === UserAccountTypes.ADMIN);
            const adminRole: RolesInterface = initialRoleList.find(
                (role: RolesInterface) => role.displayName === UserAccountTypes.ADMIN) as RolesInterface;
            const everyoneRole: RolesInterface = initialRoleList.find(
                (role: RolesInterface) => role.displayName === "everyone") as RolesInterface;

            
            if (!adminGroup || !adminRole) {
                return;
            }

            processedUser = {
                ...processedUser,
                groups: [ adminGroup ],
                roles: [ adminRole, everyoneRole ]
            };
        }

        addUserBasic(processedUser);
    };

    /**
     * Persists the profile image change done from the summary view in wizard state.
     *
     * @param url - Profile URL.
     */
    const handleProfileImageChange = (url: string): void => {
        setWizardState({
            ...wizardState,
            [ WizardStepsFormTypes.BASIC_DETAILS ]: {
                ...wizardState[ WizardStepsFormTypes.BASIC_DETAILS ],
                profileUrl: url
            }
        });
    };

    const ALL_STEPS: WizardStepInterface[] = [
        {
            content: (
                <AddUserUpdated
                    triggerSubmit={ submitGeneralSettings }
                    initialValues={ wizardState && wizardState[ WizardStepsFormTypes.BASIC_DETAILS ] }
                    emailVerificationEnabled={ emailVerificationEnabled }
                    onSubmit={ (values: AddUserWizardStateInterface) => 
                        handleWizardFormSubmit(values, WizardStepsFormTypes.BASIC_DETAILS) }
                    hiddenFields={ hiddenFields }
                    requestedPasswordOption={ wizardState &&
                        wizardState[ WizardStepsFormTypes.BASIC_DETAILS ]?.passwordOption }
                    isFirstNameRequired={ isFirstNameRequired }
                    isLastNameRequired={ isLastNameRequired }
                    isEmailRequired={ isEmailRequired }
                    setUserSummaryEnabled={ setUserSummaryEnabled }
                    setAskPasswordFromUser={ setAskPasswordFromUser }
                    setOfflineUser={ setOfflineUser }
                    setSelectedUserStore = { setSelectedUserStore }
                    isBasicDetailsLoading={ isBasicDetailsLoading }
                    setBasicDetailsLoading={ setBasicDetailsLoading }
                    validationConfig ={ validationData }
                    isUserStoreError={ isUserStoreError }
                    readWriteUserStoresList={ readWriteUserStoresList }
                />
            ),
            icon: getUserWizardStepIcons().general,
            title: t("console:manage.features.user.modals.addUserWizard.steps.basicDetails")
        },
        {
            content: (
                <AddUserGroup
                    triggerSubmit={ submitGroupList }
                    onSubmit={ (values: AddUserWizardStateInterface) =>
                        handleWizardFormSubmit(values, WizardStepsFormTypes.GROUP_LIST) }
                    initialValues={
                        {
                            groupList: groupList,
                            initialGroupList: initialGroupList,
                            initialTempGroupList: initialTempGroupList,
                            tempGroupList: tempGroupList
                        }
                    }
                    handleGroupListChange={ (groups: RolesInterface[]) => handleGroupListChange(groups) }
                    handleTempListChange={ (groups: RolesInterface[]) => handleAddedGroupListChange(groups) }
                    handleInitialTempListChange={ (groups: RolesInterface[]) =>
                        handleAddedGroupInitialListChange(groups) }
                    handleInitialGroupListChange={ (groups: RolesInterface[]) => handleInitialGroupListChange(groups) }
                    handleSetGroupId={ null }
                />
            ),
            icon: getUserWizardStepIcons().groups,
            title: t("console:manage.features.user.modals.addUserWizard.steps.groups")
        },
        {
            content: (
                viewRolePermissions
                    ? (<RolePermissions
                        data-testid={ `${ testId }-role-permission` }
                        handleNavigateBack={ handleViewRolePermission }
                        handleViewNextButton={ handleViewNextButton }
                        roleId={ selectedRoleId }
                    />)
                    : (<AddUserRole
                        triggerSubmit={ submitRoleList }
                        onSubmit={ (values: AddUserWizardStateInterface) =>
                            handleWizardFormSubmit(values, WizardStepsFormTypes.ROLE_LIST) }
                        initialValues={
                            {
                                initialRoleList: initialRoleList,
                                initialTempRoleList: initialTempRoleList,
                                roleList: roleList,
                                tempRoleList: tempRoleList
                            }
                        }
                        handleRoleListChange={ (roles: RolesInterface[] |
                             OrganizationRoleListItemInterface[]) => handleRoleListChange(roles) }
                        handleTempListChange={ (roles: RolesInterface[] |
                             OrganizationRoleListItemInterface[]) => handleAddedListChange(roles) }
                        handleInitialTempListChange={ (roles: RolesInterface[] |
                             OrganizationRoleListItemInterface[]) => handleAddedRoleInitialListChange(roles) }
                        handleInitialRoleListChange={ (roles: RolesInterface[] |
                             OrganizationRoleListItemInterface[]) => handleInitialRoleListChange(roles) }
                        handleSetRoleId={ (roleId: string) => handleRoleIdSet(roleId) }
                    />)
            ),
            icon: getUserWizardStepIcons().roles,
            title: t("console:manage.features.user.modals.addUserWizard.steps.roles")
        },
        {
            content: (
                <AddUserWizardSummary
                    triggerSubmit={ finishSubmit }
                    selectedUserStore = { selectedUserStore }
                    username={ 
                        isAlphanumericUsername
                            ? wizardState && wizardState[ WizardStepsFormTypes.BASIC_DETAILS ]?.userName
                            : wizardState && wizardState[ WizardStepsFormTypes.BASIC_DETAILS ]?.email
                    }
                    password={ wizardState && wizardState[ WizardStepsFormTypes.BASIC_DETAILS ]?.newPassword }
                    isPasswordBased={ askPasswordFromUser }
                />
            ),
            icon: getUserWizardStepIcons().summary,
            title: t("console:manage.features.user.modals.addUserWizard.steps.summary")
        }
    ];

    /**
     * Resolves the step content.
     *
     * @returns Step content.
     */
    const resolveWizardTitle = (): string => {
        let wizardTitle: string = "";

        if (defaultUserTypeSelection === UserAccountTypes.USER) {
            wizardTitle = t("extensions:manage.users.wizard.addUser.title");
        } 
        
        if (defaultUserTypeSelection === UserAccountTypes.ADMINISTRATOR) {
            wizardTitle = t("extensions:manage.users.wizard.addAdmin.internal.title");
            if (adminTypeSelection === AdminAccountTypes.INTERNAL) {
                wizardTitle = t("extensions:manage.users.wizard.addAdmin.external.title");
            }
        }

        if (wizardState && wizardState[ WizardStepsFormTypes.BASIC_DETAILS ]?.firstName) {
            wizardTitle += " - " + wizardState[ WizardStepsFormTypes.BASIC_DETAILS ]?.firstName;
        } else {
            wizardTitle += "";
        }

        return wizardTitle;
    };

    const resolveWizardSubHeading = (): string => {
        let wizardSubHeading: string = "";

        if (defaultUserTypeSelection === UserAccountTypes.USER) {
            wizardSubHeading = t("extensions:manage.users.wizard.addUser.subtitle");
        }

        return wizardSubHeading;
    };

    /**
     * User group wizard step.
     * @returns Group wizard step.
     */
    const getUserGroupsWizardStep = (): WizardStepInterface => {

        return {
            content: (
                <AddConsumerUserGroups
                    triggerSubmit={ submitGroupList }
                    onSubmit={ (values: { groups : GroupsInterface[] }) => 
                        handleWizardFormSubmit(values, WizardStepsFormTypes.GROUP_LIST) }
                    initialValues={
                        {
                            groupList: groupList,
                            initialGroupList: initialGroupList,
                            initialTempGroupList: initialTempGroupList,
                            tempGroupList: tempGroupList
                        }
                    }
                    handleGroupListChange={ 
                        (groups: GroupsInterface[]) => handleGroupListChange(groups)
                    }
                    handleTempListChange={ 
                        (groups: GroupsInterface[]) => handleAddedGroupListChange(groups)
                    }
                    handleInitialTempListChange={ 
                        (groups: GroupsInterface[]) => handleAddedGroupInitialListChange(groups)
                    }
                    handleInitialGroupListChange={ 
                        (groups: GroupsInterface[]) => handleInitialGroupListChange(groups)
                    }
                    handleSetGroupId={ null }
                />
            ),
            icon: getUserWizardStepIcons().groups,
            name: WizardStepsFormTypes.GROUP_LIST,
            title: t("console:manage.features.user.modals.addUserWizard.steps.groups")
        };
    };

    /**
     * User role wizard step.
     * @returns Role wizard step.
     */
    const getUserRoleWizardStep = (): WizardStepInterface => {
        return {
            content: (
                viewRolePermissions
                    ? (<RolePermissions
                        data-testid={ `${ testId }-role-permission` }
                        handleNavigateBack={ handleViewRolePermission }
                        handleViewNextButton={ handleViewNextButton }
                        roleId={ selectedRoleId }
                    />)
                    : (<AddUserRole
                        triggerSubmit={ submitRoleList }
                        onSubmit={ (values: AddUserWizardStateInterface) =>
                            handleWizardFormSubmit(values, WizardStepsFormTypes.ROLE_LIST) }
                        initialValues={
                            {
                                initialRoleList: initialRoleList,
                                initialTempRoleList: initialTempRoleList,
                                roleList: roleList,
                                tempRoleList: tempRoleList
                            }
                        }
                        handleRoleListChange={ (roles: RolesInterface[] |
                             OrganizationRoleListItemInterface[]) => handleRoleListChange(roles) }
                        handleTempListChange={ (roles: RolesInterface[] |
                             OrganizationRoleListItemInterface[]) => handleAddedListChange(roles) }
                        handleInitialTempListChange={ (roles: RolesInterface[] |
                             OrganizationRoleListItemInterface[]) => handleAddedRoleInitialListChange(roles) }
                        handleInitialRoleListChange={ (roles: RolesInterface[] |
                             OrganizationRoleListItemInterface[]) => handleInitialRoleListChange(roles) }
                        handleSetRoleId={ (roleId: string) => handleRoleIdSet(roleId) }
                    />)
            ),
            icon: getUserWizardStepIcons().roles,
            title: t("console:manage.features.user.modals.addUserWizard.steps.roles")
        };
    };

    /**
     * Summary wizard step.
     * @returns Summary wizard step.
     */
    const getSummaryWizardStep = (): WizardStepInterface => {

        return {
            content: (
                <AddConsumerUserWizardSummary
                    triggerSubmit={ finishSubmit }
                    onSubmit={ handleWizardFormFinish }
                    summary={ generateWizardSummary() }
                    onProfileImageChange={ handleProfileImageChange }
                />
            ),
            icon: getUserWizardStepIcons().summary,
            name: WizardStepsFormTypes.SUMMARY,
            title: t("console:manage.features.user.modals.addUserWizard.steps.summary")
        };
    };

    /**
     * User summary wizard step.
     * @returns User summary wizard step.
     */
    const getUserSummaryWizardStep = (): WizardStepInterface => {       
         
        return {
            content: (
                <AddUserWizardSummary
                    triggerSubmit={ finishSubmit }
                    selectedUserStore = { selectedUserStore }
                    username={ 
                        isAlphanumericUsername
                            ? wizardState[ WizardStepsFormTypes.BASIC_DETAILS ]?.userName
                            : wizardState[ WizardStepsFormTypes.BASIC_DETAILS ]?.email
                    }
                    password={ wizardState[ WizardStepsFormTypes.BASIC_DETAILS ]?.newPassword }
                    isPasswordBased={ askPasswordFromUser }
                />
            ),
            icon: getUserWizardStepIcons().summary,
            name: WizardStepsFormTypes.USER_SUMMARY,
            title: t("console:manage.features.user.modals.addUserWizard.steps.summary")
        };
    };
    
    /**
     * Resolves the step content.
     *
     * @returns Step content.
     */
    const resolveStepContent = (): ReactElement => {
        switch (wizardSteps[ currentWizardStep ]?.name) {
            case WizardStepsFormTypes.USER_TYPE:
                return getUserSelectionWizardStep()?.content;
            case WizardStepsFormTypes.SUMMARY:
                return getSummaryWizardStep()?.content;
            case WizardStepsFormTypes.USER_SUMMARY:
                return getUserSummaryWizardStep()?.content;
        }
    };

    const STEPS: WizardStepInterface[] = isAdminUser 
        ? isUserSummaryEnabled ? [ ALL_STEPS[0], ...ALL_STEPS.slice(3) ] : [ ALL_STEPS[0] ]
        : isUserSummaryEnabled ? [ ...ALL_STEPS ] : ALL_STEPS.slice(0, ALL_STEPS.length - 1);

    const showInternalUserWizard = (): ReactElement => {
        return (
            <>
                <Modal.Content className="steps-container">
                    <Steps.Group
                        current={ currentWizardStep }
                    >
                        { STEPS.map((step: WizardStepInterface, index: number) => (
                            <Steps.Step
                                key={ index }
                                icon={ step.icon }
                                title={ step.title }
                            />
                        )) }
                    </Steps.Group>
                </Modal.Content>
                <Modal.Content className="content-container" scrolling>
                    { alert && alertComponent }
                    { STEPS[ currentWizardStep ].content }
                </Modal.Content>
            </>
        );
    };

    const showExternalUserWizard = (): ReactElement => {
        return (
            <Modal.Content className="content-container" scrolling>
                { alert && alertComponent }
                { resolveStepContent() }
            </Modal.Content>

        );
    };

    const handleModalAction = (): ReactElement => {
        return (
            <Modal.Actions>
                <Grid>
                    <Grid.Row column={ 1 }>
                        <Grid.Column mobile={ 8 } tablet={ 8 } computer={ 8 }>
                            <LinkButton
                                data-testid={ `${ testId }-cancel-button` }
                                floated="left"
                                onClick={ () => {
                                    updateList();
                                    closeWizard();
                                } }
                            >
                                { t("common:cancel") }
                            </LinkButton>
                        </Grid.Column>
                        <Grid.Column mobile={ 8 } tablet={ 8 } computer={ 8 }>
                            { currentWizardStep < STEPS.length - 1 && viewNextButton && (
                                <PrimaryButton
                                    data-testid={ `${ testId }-next-button` }
                                    floated="right"
                                    onClick={ navigateToNext }
                                    loading={ isBasicDetailsLoading }
                                >
                                    { t("console:manage.features.user.modals.addUserWizard.buttons.next") }
                                    <Icon name="arrow right"/>
                                </PrimaryButton>
                            ) }
                            { currentWizardStep === STEPS.length - 1 && (
                                <PrimaryButton
                                    data-testid={ `${ testId }-finish-button` }
                                    floated="right"
                                    onClick={ navigateToNext }
                                    loading={ isSubmitting }
                                    disabled={ isSubmitting || isFinishButtonDisabled }
                                >
                                        Finish</PrimaryButton>
                            ) }
                            { (wizardSteps?.length > 1 && currentWizardStep > 0 && 
                                    (wizardSteps[ currentWizardStep ]?.name !== WizardStepsFormTypes.USER_SUMMARY)) && (
                                <LinkButton
                                    data-testid={ `${ testId }-previous-button` }
                                    floated="right"
                                    onClick={ navigateToPrevious }
                                >
                                    <Icon name="arrow left"/>
                                    { t("console:manage.features.user.modals.addUserWizard.buttons.previous") }
                                </LinkButton>
                            ) }
                        </Grid.Column>
                    </Grid.Row>
                </Grid>
            </Modal.Actions>
        );
    };

    return (
        wizardSteps && isStepsUpdated ? (
            <Modal
                data-testid={ testId }
                open={ true }
                className="wizard application-create-wizard"
                dimmer="blurring"
                size="small"
                onClose={ closeWizard }
                closeOnDimmerClick={ false }
                closeOnEscape
            >
                <Modal.Header className="wizard-header">
                    { resolveWizardTitle() }
                    <Heading as="h6">
                        { resolveWizardSubHeading() }
                    </Heading>
                </Modal.Header>
                { isSubOrg ? (
                    <>
                        { (userTypeSelection === UserAccountTypesMain.INTERNAL) && showInternalUserWizard() }
                        { (userTypeSelection === UserAccountTypesMain.EXTERNAL) && showExternalUserWizard() }
                    </>
                ) : (
                    <>
                        { showInternalUserWizard() }
                    </>
                ) }
                { handleModalAction() }
            </Modal>
        ) : null
    );
};

/**
 * Default props for the add user wizard.
 */
AddUserWizard.defaultProps = {
    compact: false,
    conditionallyShowStepper: false,
    currentStep: 0,
    emailVerificationEnabled: false,
    showStepper: true,
    submitStep: WizardStepsFormTypes.ROLE_LIST
};
