/**
 * Copyright (c) 2020, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
 *
 * WSO2 Inc. licenses this file to you under the Apache License,
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

import { EmptyPlaceholder } from "@wso2is/react-components";
import { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { ErrorPageLayout } from "../../layouts";
import * as React from "react";
import { Link } from "react-router-dom";
import { Button } from "semantic-ui-react";
import { EmptyPlaceholderIllustrations, GlobalConfig } from "../../configs";

/**
 * Access denied error page.
 *
 * @return {React.ReactElement}
 */
const AccessDeniedErrorPage = (): ReactElement => {
    const { t } = useTranslation();
    return (
        <ErrorPageLayout>
            <EmptyPlaceholder
                action={ (
                    <Button
                        className="link-button"
                        as={ Link }
                        to={ GlobalConfig.appHomePath }
                    >
                        { t("userPortal:placeholders.accessDeniedError.action") }
                    </Button>
                ) }
                image={ EmptyPlaceholderIllustrations.accessDeniedError }
                imageSize="tiny"
                subtitle={ [
                    t("userPortal:placeholders.accessDeniedError.subtitles.0"),
                    t("userPortal:placeholders.accessDeniedError.subtitles.1")
                ] }
                title={ t("userPortal:placeholders.accessDeniedError.title") }
            />
        </ErrorPageLayout>
    );
};

/**
 * A default export was added to support React.lazy.
 * TODO: Change this to a named export once react starts supporting named exports for code splitting.
 * @see {@link https://reactjs.org/docs/code-splitting.html#reactlazy}
 */
export default AccessDeniedErrorPage;
